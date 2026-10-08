import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { classifySubjectScope, identitySegments, nameTokens } = require('../../../server/enrichment/_lib/source-identity.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { officialRootsFor, officialWebsiteFor } = require('../../../server/enrichment/_lib/official-source-overrides.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { eligibleFact, reviewEvidence } = require('../../../server/enrichment/_lib/trusted-evidence.js');

/**
 * Website identity: which stored pages are a venue's own. Every case is a real stored website from the catalogue and a
 * real stored page URL (8 Oct 2026 export), so a rule that drifts is caught against the data it was written for.
 */

type Row = { familypilotPlaceId: string; name: string; website: string | null; officialRoots?: string[] };
const row = (familypilotPlaceId: string, name: string, website: string): Row => ({
  familypilotPlaceId, name,
  website: officialWebsiteFor(familypilotPlaceId, website),
  officialRoots: officialRootsFor(familypilotPlaceId),
});
const TUSSAUDS = row('fp-google-ChIJgZ24Us4adkgRpDNAwNPO_SY', 'Madame Tussauds London', 'https://www.madametussauds.com/london/en/');
const TRENT = row('fp-google-ChIJC_OX14oYdkgRR63K3nTnZ1I', 'Trent Park', 'http://trentcountrypark.com/Welcome.html');
const DOCKLANDS = row('fp-google-ChIJVTZUsMcCdkgRMc_-OpJq9v8', 'London Museum Docklands', 'https://www.londonmuseum.org.uk/docklands/');
const ASK = row('fp-osm-1409601934', 'ASK Italian', 'https://www.askitalian.co.uk/italian/restaurants/london-finchley');
const NANDOS = row('fp-osm-1409601942', "Nando's", 'https://www.nandos.co.uk/restaurants/finchley-great-north-leisure');
const CRYSTAL = row('fp-google-ChIJ94vQ-0IBdkgRxsGErkV2hZo', 'Crystal Palace Park', 'https://www.crystalpalaceparktrust.org/');
const CP_FARM = row('fp-google-ChIJ06m8z2kBdkgRzsOi7Wsu_ck', 'Crystal Palace Park Farm', 'https://www.capel.ac.uk/community/crystal-palace-park-farm/');
const PRIMROSE = row('fp-google-ChIJ2yb0sesadkgRIQOyE6qMxLU', 'Primrose Hill', 'https://www.royalparks.org.uk/parks/the-regents-park/things-to-see-and-do/primrose-hill');
const REGENTS = row('fp-google-ChIJB76zsMMadkgRvhhquw8-mAg', "The Regent's Park", 'https://www.royalparks.org.uk/visit/parks/regents-park-primrose-hill?utm_source=google&utm_medium=organic');
const DULWICH = row('fp-google-ChIJbSe-4PoDdkgReFaqbED1N9o', 'Dulwich Park', 'https://dulwichparkfriends.org.uk/the-park/map-of-the-park/');
const WETLANDS = row('fp-google-ChIJgUtOcjEcdkgR6Y_NLIc0XBQ', 'Walthamstow Wetlands, London Wildlife Trust', 'https://www.wildlondon.org.uk/walthamstow-wetlands-nature-reserve');
const SYDENHAM = row('fp-google-ChIJF4YXjN4DdkgRvJe2-r5usvY', 'Sydenham Hill Wood', 'http://www.wildlondon.org.uk/reserves/sydenham-hill-wood-and-coxs-walk');
const CATALOGUE = [TUSSAUDS, TRENT, DOCKLANDS, ASK, NANDOS, CRYSTAL, CP_FARM, PRIMROSE, REGENTS, DULWICH, WETLANDS, SYDENHAM];

const scope = (venue: Row, sourceUrl: string, pageTitle: string | null = null) =>
  classifySubjectScope({ sourceUrl, pageTitle, venue, catalogue: CATALOGUE }).scope;

describe('a trailing language or front-page segment is not a section', () => {
  it('strips only trailing en, index and welcome segments', () => {
    expect(identitySegments('https://www.madametussauds.com/london/en/')).toEqual(['london']);
    expect(identitySegments('http://trentcountrypark.com/Welcome.html')).toEqual([]);
    expect(identitySegments('https://www.wimbledon.com/en_GB/museum_and_tours/index.html')).toEqual(['en_gb', 'museum_and_tours']);
    expect(identitySegments('https://www.londonmuseum.org.uk/docklands/')).toEqual(['docklands']);
    expect(identitySegments('https://www.example.org/english-garden/')).toEqual(['english-garden']);
  });

  it("Madame Tussauds' own visitor pages are its own (\"There is no parking onsite\")", () => {
    expect(scope(TUSSAUDS, 'https://www.madametussauds.com/london/plan-your-visit/before-you-visit/directions-parking/')).toBe('venue_own_subtree');
    // ... and another city's pages on the same site are not.
    expect(scope(TUSSAUDS, 'https://www.madametussauds.com/amsterdam/plan-your-visit/')).not.toBe('venue_own_subtree');
  });

  it("a real section is never widened: the London Museum's all-sites families page is not Docklands' own", () => {
    expect(scope(DOCKLANDS, 'https://www.londonmuseum.org.uk/visit/families/')).toBe('sibling_unverified');
  });
});

describe('a host is never assumed to be one venue', () => {
  it("a chain's other branches stay other pages, though the host names the venue", () => {
    expect(scope(ASK, 'https://www.askitalian.co.uk/italian-restaurants/greater-london/london/london-gloucester-arcade')).not.toBe('venue_own_subtree');
    expect(scope(NANDOS, 'https://www.nandos.co.uk/restaurants/camden')).not.toBe('venue_own_subtree');
  });
});

describe('reviewed official roots', () => {
  it("Crystal Palace Park's visitor site is its own; the farm's college page is not the park's", () => {
    expect(scope(CRYSTAL, 'https://www.crystalpalacepark.org.uk/visit-dinosaur-playground-dnc9')).toBe('venue_own_subtree');
    expect(scope(CRYSTAL, 'https://www.capel.ac.uk/community/crystal-palace-park-farm/visit')).not.toBe('venue_own_subtree');
  });

  it("Primrose Hill's own Royal Parks page is Primrose Hill's, and no longer The Regent's Park's", () => {
    const url = 'https://www.royalparks.org.uk/visit/parks/regents-park-primrose-hill/primrose-hill';
    expect(scope(PRIMROSE, url)).toBe('venue_own_subtree');
    expect(scope(REGENTS, url)).toBe('other_catalogue_venue');
    // The Regent's Park keeps the rest of its own section.
    expect(scope(REGENTS, 'https://www.royalparks.org.uk/visit/parks/regents-park-primrose-hill/facilities')).toBe('venue_own_subtree');
  });

  it("Dulwich Park's friends' site is its own beyond the map page", () => {
    expect(scope(DULWICH, 'https://dulwichparkfriends.org.uk/the-park/location-travel/')).toBe('venue_own_subtree');
  });

  it('every reviewed root names a host no other catalogue venue uses, or is deeper than any it sits under', () => {
    for (const venue of CATALOGUE) {
      for (const root of venue.officialRoots ?? []) {
        const others = CATALOGUE.filter((v) => v !== venue);
        const claimed = others.filter((v) => scope(v, root) === 'venue_own_subtree');
        expect(claimed.map((v) => v.name), `${venue.name}: ${root}`).toEqual([]);
      }
    }
  });
});

describe('a name is the venue, not its operator', () => {
  it('drops the operator suffix from the tokens', () => {
    expect(nameTokens('Walthamstow Wetlands, London Wildlife Trust')).toEqual(['walthamstow', 'wetlands']);
    expect(nameTokens('Kensington Gardens - The Royal Parks')).toEqual(['kensington', 'gardens']);
  });

  it("the reserve's own page is now recognised as named; another reserve's page still is not", () => {
    expect(scope(WETLANDS, 'https://www.wildlondon.org.uk/nature-reserves/walthamstow-wetlands', 'Walthamstow Wetlands | London Wildlife Trust')).toBe('venue_named_page');
    expect(scope(WETLANDS, 'https://www.wildlondon.org.uk/nature-reserves/sydenham-hill-wood-and-coxs-walk', "Sydenham Hill Wood and Cox's Walk | London Wildlife Trust")).not.toBe('venue_named_page');
    // The operator's site-wide filter list ("Baby changing facilities Bird hides ...") is nobody's own page.
    expect(scope(WETLANDS, 'https://www.wildlondon.org.uk/nature-reserves?great_for%5B60%5D=60', 'Nature reserves | London Wildlife Trust')).toBe('sibling_unverified');
  });
});

describe('a rescoped page is for a person to approve, never the automatic path', () => {
  // reviewEvidence reads the wall clock (a reading older than 14 days is never eligible), so the reading is dated
  // relative to now and the test does not expire.
  const NOW = Date.now();
  const fact = {
    field: 'parking', value: 'no', confidence: 'high', sourceType: 'official_website', retrievedAt: new Date(NOW - 2 * 86_400_000).toISOString(),
    sourceUrl: 'https://www.madametussauds.com/london/plan-your-visit/before-you-visit/directions-parking/',
    evidenceText: 'There is no parking onsite but there are numerous car parks near to Madame Tussauds.',
  };
  const bundle = (reason: string) => ({
    facts: [fact],
    sources: [{ url: fact.sourceUrl, sourceType: 'official_website', fetchStatus: 'ok', retrievedAt: fact.retrievedAt, subjectScope: 'venue_own_subtree', subjectScopeReason: reason, facts: [fact] }],
  });

  it('a crawl-recorded page and a rescoped page both reach a draft', () => {
    expect(eligibleFact(fact, bundle('under_own_website'), NOW)).toBe(true);
    expect(eligibleFact(fact, bundle('rescoped_2026_10 from sibling_unverified: under_own_website'), NOW)).toBe(true);
  });

  it('only the crawl-recorded page may be approved automatically', () => {
    expect(eligibleFact(fact, bundle('under_own_website'), NOW, { excludeRescoped: true })).toBe(true);
    expect(eligibleFact(fact, bundle('rescoped_2026_10 from sibling_unverified: under_own_website'), NOW, { excludeRescoped: true })).toBe(false);
  });

  it('the automatic payload drops the rescoped fact; the draft a person reviews keeps it', () => {
    const rescoped = bundle('rescoped_2026_10 from sibling_unverified: under_own_website');
    const auto = reviewEvidence(rescoped, { excludeRescoped: true });
    const manual = reviewEvidence(rescoped);
    expect(JSON.stringify(auto.payload)).not.toMatch(/parking/);
    expect(JSON.stringify(manual.payload)).toMatch(/parking/);
  });
});

describe('the rescope script cannot write by accident', () => {
  const SCRIPT = resolve(__dirname, '../../../scripts/rescope-evidence.mjs');
  const run = (args: string[], env: Record<string, string> = {}) => {
    try {
      return { status: 0, output: execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', SUPABASE_SECRET_KEY: '', ...env } }) };
    } catch (error) {
      const err = error as { status?: number; stdout?: string; stderr?: string };
      return { status: err.status ?? 1, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
    }
  };
  it('refuses --write without RESCOPE_CONFIRM=yes', () => {
    const r = run(['--write']);
    expect(r.status).toBe(2);
    expect(r.output).toMatch(/Refusing to write without RESCOPE_CONFIRM=yes/);
  });
  it('refuses to combine --write with an offline --input file', () => {
    const r = run(['--write', '--input', 'x.json'], { RESCOPE_CONFIRM: 'yes' });
    expect(r.status).toBe(2);
  });
  it('with confirmation but no database, still writes nothing', () => {
    const r = run(['--write'], { RESCOPE_CONFIRM: 'yes' });
    expect(r.status).toBe(2);
    expect(r.output).toMatch(/not configured/);
  });
});
