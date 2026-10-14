import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MAPPABLE_PROVIDERS, canPlotOnOwnMap } from '@/src/utils/map-compliance';
import { FSA_CREDIT, OGL_URL, creditsForPlaces, externalCreditFor } from '@/src/services/places/attribution';

/**
 * The Food Standards Agency's Food Hygiene Rating Scheme as a fourth independent source (Open Government Licence v3.0), used for IDENTITY ONLY: that a
 * food business of this name exists at this address, and where. What the FSA's own terms say (read 14 October 2026, `docs/SOFT_PLAY_RECOVERY_PLAN.md`):
 * no attribution statement of its own, so the OGL default applies; no use of the FSA logo or FHRS imagery; and a rating shown must be the current one.
 * So: the shape has nowhere to keep a rating, a score or an image, and the credit is the OGL default, verbatim. Synthetic fixtures only.
 */
const root = join(__dirname, '../../..');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const identities = require(join(root, 'server/places/lib/independent-identities.js')) as any;

const RECORD_URL = 'https://ratings.food.gov.uk/api/download-data/xml/establishments/';
const fhrsEntry = (over: Record<string, unknown> = {}) => ({
  familypilotId: 'fp-fhrs-1670908',
  name: 'Example Soft Play',
  category: 'soft_play',
  identity: { source: 'fhrs', url: `${RECORD_URL}1670908`, retrievedAt: '2026-10-14', licence: 'OGL-3.0', externalId: '1670908' },
  location: { latitude: 51.5905, longitude: -0.1427, source: 'fhrs', licence: 'OGL-3.0' },
  website: 'https://example-softplay.co.uk/',
  reviewedBy: 'A. Reviewer',
  reviewedAt: '2026-10-22',
  ...over,
});

describe('the registry accepts the Food Standards Agency register, for identity only', () => {
  it('serves a reviewed FHRS venue under its own provider, and nothing else about it', () => {
    const problems: string[] = [];
    const valid = identities.loadIdentities({ entries: [fhrsEntry()], onProblem: (id: string, p: string) => problems.push(`${id}: ${p}`) });
    expect(problems).toEqual([]);
    const [place] = valid.map(identities.identityToPlace);
    expect(place).toMatchObject({ provider: 'fhrs', independentSource: 'fhrs', externalId: 'fhrs:1670908', latitude: 51.5905, longitude: -0.1427 });
    // identity only: no rating, score, phone, address or photograph rides along
    expect(Object.keys(place).sort()).toEqual(
      ['category', 'enrichmentStatus', 'externalId', 'familypilotId', 'fetchedAt', 'googleTypes', 'independentSource', 'latitude', 'longitude', 'name', 'photos', 'provider', 'website'].sort(),
    );
  });

  it('refuses a licence FHRS cannot carry, and an entry that cannot be traced to one establishment', () => {
    expect(identities.problemWith(fhrsEntry({ identity: { ...fhrsEntry().identity, licence: 'CC0-1.0' } }))).toMatch(/not one fhrs can carry/);
    expect(identities.problemWith(fhrsEntry({ identity: { ...fhrsEntry().identity, licence: 'ODbL-1.0' } }))).toMatch(/not one fhrs can carry/);
    expect(identities.problemWith(fhrsEntry({ location: { ...fhrsEntry().location, licence: 'ODbL-1.0' } }))).toMatch(/not one fhrs can carry/);
    expect(identities.problemWith(fhrsEntry({ identity: { ...fhrsEntry().identity, externalId: 'abc' } }))).toMatch(/FHRSID/);
    expect(identities.problemWith(fhrsEntry({ identity: { ...fhrsEntry().identity, externalId: undefined } }))).toMatch(/FHRSID/);
    expect(identities.problemWith(fhrsEntry({ identity: { ...fhrsEntry().identity, url: `${RECORD_URL}999999` } }))).toMatch(/Food Standards Agency record of/);
    expect(identities.problemWith(fhrsEntry({ identity: { ...fhrsEntry().identity, url: 'https://example.org/1670908' } }))).toMatch(/Food Standards Agency record of/);
    expect(identities.problemWith(fhrsEntry())).toBeNull();
  });

  it('has nowhere to keep a hygiene rating, a score, a reply, a phone number or an image', () => {
    for (const key of ['rating', 'ratingValue', 'ratingKey', 'ratingDate', 'scores', 'rightToReply', 'phone', 'address', 'image', 'logo']) {
      expect(identities.problemWith({ ...fhrsEntry(), [key]: key === 'scores' ? { hygiene: 0 } : '5' }), key).toMatch(/unknown key/);
    }
    expect(identities.problemWith(fhrsEntry({ identity: { ...fhrsEntry().identity, ratingValue: '5' } }))).toMatch(/identity has an unknown key/);
    expect(identities.problemWith(fhrsEntry({ location: { ...fhrsEntry().location, postcode: 'N10 1HD' } }))).toMatch(/location has an unknown key/);
    // and the reader never names a rating field, so nothing in the server can pick one up
    const source = readFileSync(join(root, 'server/places/lib/independent-identities.js'), 'utf8');
    expect(source).not.toMatch(/RatingValue|RatingKey|RatingDate|RightToReply|ratingImage/i);
  });

  it('keeps FHRS in its own file, apart from every other licence family', () => {
    expect(identities.fileProblem('fhrs', fhrsEntry())).toBeNull();
    expect(identities.fileProblem('wikidata', fhrsEntry())).toMatch(/holds only identity.source wikidata/);
    expect(identities.fileProblem('os-greenspace', fhrsEntry())).toMatch(/holds only identity.source os-greenspace/);
    expect(identities.fileProblem('fhrs', fhrsEntry({ location: { ...fhrsEntry().location, source: 'osm', licence: 'ODbL-1.0' } }))).toMatch(/belongs in osm.json/);
    // an FHRS identity with a Wikidata position would put Wikidata content in the FHRS file
    expect(identities.fileProblem('fhrs', fhrsEntry({ location: { ...fhrsEntry().location, source: 'wikidata', licence: 'CC0-1.0' } }))).toMatch(/holds only positions whose source is fhrs/);
  });

  it('ships empty until a person has reviewed a set, and names its source and licence', () => {
    const file = JSON.parse(readFileSync(join(root, 'server/places/data/identities/fhrs.json'), 'utf8'));
    expect(file).toMatchObject({ version: 1, source: 'fhrs', licence: 'OGL-3.0', entries: [] });
    expect(file._comment).toMatch(/Identity only/);
    expect(file._comment).toMatch(/Open Government Licence v3\.0/);
  });
});

describe('the app credits the Food Standards Agency as the Open Government Licence asks, and uses none of its imagery', () => {
  it('owes the OGL default statement, verbatim, with the source named', () => {
    expect(externalCreditFor('fhrs')).toBe('fsa');
    expect(FSA_CREDIT).toContain('Contains public sector information licensed under the Open Government Licence v3.0.');
    expect(FSA_CREDIT).toMatch(/^Source: Food Standards Agency\./);
    expect(OGL_URL).toBe('https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/');
    // Wikidata and our own rows still owe nobody
    expect(externalCreditFor('wikidata')).toBeNull();
    expect(externalCreditFor('familypilot')).toBeNull();
  });

  it('shows each credit once, in a stable order', () => {
    const places = [{ provider: 'fhrs' as const }, { provider: 'os-greenspace' as const }, { provider: 'google' as const }, { provider: 'fhrs' as const }, { provider: 'osm' as const }];
    expect(creditsForPlaces(places)).toEqual(['google', 'osm', 'os', 'fsa']);
  });

  it('lets the app draw an FHRS venue on its own map, because the credit is shown', () => {
    expect([...MAPPABLE_PROVIDERS]).toContain('fhrs');
    expect(canPlotOnOwnMap({ provider: 'fhrs' })).toBe(true);
  });

  it('puts the FSA credit on the screens that carry credits, and no FSA or FHRS logo anywhere', () => {
    for (const file of ['familypilot/src/components/shared/PlaceAttribution.tsx', 'familypilot/src/components/shared/PlaceCredits.tsx', 'familypilot/app/about.tsx']) {
      const source = readFileSync(join(root, file), 'utf8');
      expect(source, file).toMatch(/FSA_CREDIT/);
      expect(source, file).not.toMatch(/\.(png|svg|jpg)['"]/);
    }
    const notice = readFileSync(join(root, 'server/places/data/identities/NOTICE.md'), 'utf8');
    for (const needle of ['fhrs.json', 'Food Standards Agency', 'Contains public sector information licensed under the Open Government Licence v3.0']) expect(notice).toContain(needle);
  });
});
