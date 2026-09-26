import { describe, expect, it } from 'vitest';

const {
  FIELD_INVENTORY,
  CLAIM_FIELD_KEYS,
  PROVIDER_FIELD_KEYS,
  DERIVED_FIELD_KEYS,
  CLAIM_STATES,
  SOURCE_AFFINITY,
  classifySourceAffinity,
  otherVenueSlugsByHost,
  decodeCorpus,
  decodeClaimLine,
  decodeMetadataLine,
  decodePlaceLine,
  decodeDraftLine,
  carriesInformation,
  consumerServesFacts,
  classifyClaimField,
  claimStateIsUsable,
  readinessTier,
  auditCatalogue,
  buildVenueRows,
  draftAssertsField,
  providerFieldPresent,
} = require('../../../server/enrichment/_lib/venue-readiness-audit');
const { isClaimActive } = require('../../../server/enrichment/_lib/claims-store');

/**
 * P0 Venue Intelligence: the baseline audit's own tests.
 *
 * Three of these pin corrections from review, where the audit measured something different from
 * what production actually serves. Each has its own describe block naming the mistake, because the
 * mistake is the reason the test exists.
 */

const TODAY = '2026-09-26';
const claim = (over: Record<string, unknown> = {}) => ({
  status: 'active',
  approvedBy: 'source_evidence_auto_v2',
  validUntil: '2026-12-01',
  checkedAt: '2026-09-01',
  value: 'yes',
  fieldKey: 'familyFacilities.toilets',
  ...over,
});

describe('trust is the shipped predicate, not a second one invented here', () => {
  /**
   * The report previously called its coverage "human-approved". Production holds 223 active
   * `source_evidence_auto_v2` claims, 4 editor claims and ZERO `human:` claims, so that was simply
   * false -- and the product deliberately trusts source-evidence auto-publish for ordinary facility
   * facts. The strict `human:` rule belongs to age-policy gating alone.
   */
  it('uses claims-store isClaimActive rather than a local copy', () => {
    const source = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '../../../server/enrichment/_lib/venue-readiness-audit.js'),
      'utf8',
    );
    expect(source).toContain("require('./claims-store')");
    expect(source).toContain('isClaimActive');
  });

  it('counts a source-evidence auto-published claim for an ordinary facility', () => {
    expect(isClaimActive(claim({ approvedBy: 'source_evidence_auto_v2' }))).toBe(true);
    expect(classifyClaimField({ claims: [claim({ approvedBy: 'source_evidence_auto_v2' })] }, TODAY)).toBe('confirmed_fresh');
  });

  it('rejects the legacy ai_auto_approved approver that predates source proof', () => {
    expect(isClaimActive(claim({ approvedBy: 'ai_auto_approved' }))).toBe(false);
    expect(classifyClaimField({ claims: [claim({ approvedBy: 'ai_auto_approved' })] }, TODAY)).toBe('unknown');
  });

  it('counts an editor claim too', () => {
    expect(classifyClaimField({ claims: [claim({ approvedBy: 'enrichment-editor' })] }, TODAY)).toBe('confirmed_fresh');
  });

  it('a trusted claim valued "unknown" is not coverage', () => {
    // Three exist in production; counting them inflated environment and invented an energy-level figure.
    expect(carriesInformation('unknown')).toBe(false);
    expect(carriesInformation('{}')).toBe(false);
    expect(carriesInformation('yes')).toBe(true);
    expect(classifyClaimField({ claims: [claim({ value: 'unknown' })] }, TODAY)).toBe('unknown');
  });
});

describe('servability follows the consumer projection, not the raw status column', () => {
  /**
   * `getConsumerMetadata` hard-stops on `ai_draft` only. A `provider_only` row with active claims is
   * projected and returned as consumer-`enriched`. Treating `provider_only` as gated made the audit
   * report facts as "thrown away by the gate" that the server is designed to serve.
   */
  it('a raw provider_only venue with one trusted claim IS served', () => {
    expect(consumerServesFacts({ enrichmentStatus: 'provider_only', activeClaimCount: 1 })).toBe(true);
  });

  it('provider_only with no active claims is not served, because the projection returns null', () => {
    expect(consumerServesFacts({ enrichmentStatus: 'provider_only', activeClaimCount: 0 })).toBe(false);
  });

  it('ai_draft is blocked however many claims it holds', () => {
    expect(consumerServesFacts({ enrichmentStatus: 'ai_draft', activeClaimCount: 9 })).toBe(false);
  });

  it('an enriched venue with no active claims is also not served', () => {
    expect(consumerServesFacts({ enrichmentStatus: 'enriched', activeClaimCount: 0 })).toBe(false);
  });

  const states = (over: Record<string, string> = {}) => {
    const base: Record<string, string> = {};
    for (const f of FIELD_INVENTORY) {
      base[f.key] = f.origin === 'claim' ? 'unknown' : f.origin === 'provider' ? 'present' : 'available';
    }
    return { ...base, ...over };
  };

  it('raw provider_only + one trusted claim is not T0, and the fact is servable', () => {
    const venue = {
      familypilotPlaceId: 'v',
      enrichmentStatus: 'provider_only',
      activeClaimCount: 1,
      fieldStates: states({ toilets: 'confirmed_fresh' }),
    };
    expect(readinessTier(venue).tier).not.toBe('T0');
    expect(readinessTier(venue).tier).toBe('T2');
    const { byField, summary } = auditCatalogue([venue], {}, TODAY);
    expect(byField.toilets.servable).toBe(1);
    expect(summary.factsWithheldByConsumerBlock).toBe(0);
  });

  it('only ai_draft withholds a usable fact', () => {
    const blocked = { familypilotPlaceId: 'b', enrichmentStatus: 'ai_draft', activeClaimCount: 1, fieldStates: states({ toilets: 'confirmed_fresh' }) };
    const { summary, byField } = auditCatalogue([blocked], {}, TODAY);
    expect(summary.blockedHoldingUsableFacts).toBe(1);
    expect(summary.factsWithheldByConsumerBlock).toBe(1);
    expect(byField.toilets.usable).toBe(1);
    expect(byField.toilets.servable).toBe(0);
    // A provider field is still served: the block is about claim projection, not identity.
    expect(byField.photos.servable).toBe(1);
  });
});

describe('a candidate is a FIELD, not a venue', () => {
  /**
   * The first revision set one `hasDraft` boolean per venue and passed it to every field, so a
   * venue with any pending draft made all 15 claim fields `candidate_not_publishable`. That is how
   * it reported 1,004 candidate cells for 67 drafts which between them assert nothing.
   */
  const field = (key: string) => FIELD_INVENTORY.find((f: { key: string }) => f.key === key);

  it('reads a nested draft assertion', () => {
    expect(draftAssertsField({ familyFacilities: { parking: 'yes' } }, field('parking'))).toBe(true);
    expect(draftAssertsField({ familyFacilities: { parking: 'yes' } }, field('baby_changing'))).toBe(false);
  });

  it('an empty draft asserts nothing', () => {
    const empty = { familyFacilities: {}, accessibility: {}, sendInfo: {} };
    for (const key of CLAIM_FIELD_KEYS) {
      expect(draftAssertsField(empty, field(key)), `${key} should not be a candidate`).toBe(false);
    }
  });

  it('a draft value of "unknown" is not a candidate either', () => {
    expect(draftAssertsField({ familyFacilities: { parking: 'unknown' } }, field('parking'))).toBe(false);
  });

  it('a draft containing only parking leaves every other field unknown', () => {
    const rows = buildVenueRows({
      places: [{ familypilot_place_id: 'v1', name: 'A', category: 'park', lat: 1, lng: 2 }],
      metadata: [{ familypilot_place_id: 'v1', enrichment_status: 'ai_draft' }],
      claims: [],
      pendingDrafts: [{ familypilot_place_id: 'v1', draft_json: { familyFacilities: { parking: 'yes' } } }],
    }, TODAY);

    expect(rows[0].fieldStates.parking).toBe('candidate_not_publishable');
    expect(rows[0].fieldStates.baby_changing).toBe('unknown');
    expect(rows[0].fieldStates.visit_duration).toBe('unknown');
    expect(rows[0].fieldStates.toilets).toBe('unknown');
    const candidates = CLAIM_FIELD_KEYS.filter((k: string) => rows[0].fieldStates[k] === 'candidate_not_publishable');
    expect(candidates).toEqual(['parking']);
  });
});

describe('provider availability and derived capability stay out of the claim ledger', () => {
  /**
   * Having coordinates means Eat Nearby can attempt a lookup. It is not "confirmed fresh nearby
   * restaurant data", and booking it into `confirmed_fresh` produced a headline percentage that
   * measured nothing.
   */
  it('provider and derived fields use their own vocabularies', () => {
    const rows = buildVenueRows({
      places: [{ familypilot_place_id: 'v1', name: 'A', category: 'park', lat: 1, lng: 2, photos: ['p'] }],
      metadata: [{ familypilot_place_id: 'v1', enrichment_status: 'enriched' }],
      claims: [],
      pendingDrafts: [],
    }, TODAY);
    expect(rows[0].fieldStates.photos).toBe('present');
    expect(rows[0].fieldStates.opening_hours).toBe('missing');
    expect(rows[0].fieldStates.nearby_restaurants).toBe('available');
    expect(CLAIM_STATES).not.toContain('present');
    expect(CLAIM_STATES).not.toContain('available');
  });

  it('keeps three ledgers, each balancing on its own', () => {
    const venue = (id: string) => ({
      familypilotPlaceId: id, enrichmentStatus: 'enriched', activeClaimCount: 0,
      fieldStates: Object.fromEntries(FIELD_INVENTORY.map((f: { key: string; origin: string }) => [
        f.key, f.origin === 'claim' ? 'unknown' : f.origin === 'provider' ? 'present' : 'available',
      ])),
    });
    const { summary } = auditCatalogue([venue('a'), venue('b')], {}, TODAY);
    expect(summary.claimCells).toBe(2 * CLAIM_FIELD_KEYS.length);
    expect(summary.providerCells).toBe(2 * PROVIDER_FIELD_KEYS.length);
    expect(summary.derivedCells).toBe(2 * DERIVED_FIELD_KEYS.length);
    expect(summary.claimLedgerBalances).toBe(true);
    expect(summary.providerLedgerBalances).toBe(true);
    expect(summary.derivedLedgerBalances).toBe(true);
    // Provider presence must not appear anywhere in the claim totals.
    expect(summary.claimStateTotals.confirmed_fresh).toBe(0);
  });

  it('refuses a state from the wrong vocabulary rather than silently dropping the cell', () => {
    const venue = {
      familypilotPlaceId: 'a', enrichmentStatus: 'enriched', activeClaimCount: 1,
      fieldStates: Object.fromEntries(FIELD_INVENTORY.map((f: { key: string }) => [f.key, 'unknown'])),
    };
    expect(() => auditCatalogue([venue], {}, TODAY)).toThrow(/not valid for provider field/);
  });
});

describe('the remaining claim-field states', () => {
  it.each([
    ['fresh', { claims: [claim({ validUntil: '2026-12-01' })] }, 'confirmed_fresh'],
    ['refresh due inside the lead window', { claims: [claim({ validUntil: '2026-09-30' })] }, 'confirmed_refresh_due'],
    ['past its lifetime but inside grace', { claims: [claim({ validUntil: '2026-09-20' })] }, 'stale'],
    ['long expired', { claims: [claim({ validUntil: '2026-01-01' })] }, 'unknown'],
    ['disputed', { claims: [claim({ status: 'disputed' })] }, 'conflicting'],
    ['nothing at all', { claims: [] }, 'unknown'],
  ])('%s -> %s', (_label, input, expected) => {
    expect(classifyClaimField(input as Record<string, unknown>, TODAY)).toBe(expected);
  });

  it('separates a read-model value with no claim behind it from an absent one', () => {
    expect(classifyClaimField({ claims: [], metadataHasValue: true }, TODAY)).toBe('unsupported');
    expect(classifyClaimField({ claims: [], metadataHasValue: false }, TODAY)).toBe('unknown');
  });

  it('only fresh and refresh-due are usable', () => {
    expect(CLAIM_STATES.filter(claimStateIsUsable)).toEqual(['confirmed_fresh', 'confirmed_refresh_due']);
  });
});

describe('readiness tiers', () => {
  const venue = (over: Record<string, unknown> = {}, fields: Record<string, string> = {}) => ({
    familypilotPlaceId: 'v', enrichmentStatus: 'enriched', activeClaimCount: 5,
    fieldStates: {
      ...Object.fromEntries(FIELD_INVENTORY.map((f: { key: string; origin: string }) => [
        f.key, f.origin === 'claim' ? 'unknown' : f.origin === 'provider' ? 'present' : 'available',
      ])),
      ...fields,
    },
    ...over,
  });

  it('a venue with every provider field and no usable claim is T1', () => {
    // Provider identity must not make a venue look partly ready.
    expect(readinessTier(venue()).tier).toBe('T1');
    expect(readinessTier(venue()).usableFacts).toBe(0);
  });

  it('ignores a provider field even if it somehow carries a claim-vocabulary state', () => {
    /**
     * Readiness must iterate CLAIM_FIELD_KEYS, not every entry in fieldStates. An earlier revision
     * scanned everything, and because provider fields are present for almost every venue it made
     * them all look partly ready. The provider vocabularies alone do not catch that -- `present` is
     * not a usable claim state either way -- so this forces a provider field into the claim
     * vocabulary and proves readiness still does not count it.
     */
    const smuggled = venue({}, { photos: 'confirmed_fresh', opening_hours: 'confirmed_fresh', nearby_restaurants: 'confirmed_fresh' });
    expect(readinessTier(smuggled).usableFacts).toBe(0);
    expect(readinessTier(smuggled).tier).toBe('T1');
  });

  it('needs a facility AND environment to be explainable', () => {
    expect(readinessTier(venue({}, { toilets: 'confirmed_fresh' })).tier).toBe('T2');
    expect(readinessTier(venue({}, { environment: 'confirmed_fresh' })).tier).toBe('T2');
    expect(readinessTier(venue({}, { toilets: 'confirmed_fresh', environment: 'confirmed_fresh' })).tier).toBe('T3');
  });

  it('reaches T4 only with the facts the day planner needs', () => {
    const nearly = { toilets: 'confirmed_fresh', environment: 'confirmed_fresh', pushchair_suitability: 'confirmed_fresh', recommended_ages: 'confirmed_fresh' };
    expect(readinessTier(venue({}, nearly)).tier).toBe('T3');
    expect(readinessTier(venue({}, { ...nearly, visit_duration: 'confirmed_fresh' })).tier).toBe('T4');
  });

  it('claim-backed fields are derived from the inventory, so the two cannot drift', () => {
    expect(CLAIM_FIELD_KEYS).not.toContain('photos');
    expect(CLAIM_FIELD_KEYS).not.toContain('nearby_restaurants');
    expect(CLAIM_FIELD_KEYS).toContain('baby_changing');
    expect(CLAIM_FIELD_KEYS.length + PROVIDER_FIELD_KEYS.length + DERIVED_FIELD_KEYS.length).toBe(FIELD_INVENTORY.length);
  });
});

describe('the reconciliation can fail', () => {
  const venue = (id: string) => ({
    familypilotPlaceId: id, enrichmentStatus: 'enriched', activeClaimCount: 1,
    fieldStates: Object.fromEntries(FIELD_INVENTORY.map((f: { key: string; origin: string }) => [
      f.key, f.origin === 'claim' ? 'unknown' : f.origin === 'provider' ? 'present' : 'available',
    ])),
  });

  it('reports venues production has that the audit never received', () => {
    const { summary } = auditCatalogue([venue('a')], { expected: { venues: 3 } }, TODAY);
    expect(summary.unexplainedVenues).toBe(2);
    expect(summary.reconciles).toBe(false);
  });

  it('leaves the reconciliation unstated rather than claiming it', () => {
    const { summary } = auditCatalogue([venue('a')], {}, TODAY);
    expect(summary.expectedVenues).toBeNull();
    expect(summary.reconciles).toBeNull();
  });
});

describe('the live path and the offline fixture agree', () => {
  it('derives activeClaimCount with the same predicate the consumer path uses', () => {
    const rows = buildVenueRows({
      places: [{ familypilot_place_id: 'v1', name: 'A', category: 'park', lat: 1, lng: 2 }],
      metadata: [{ familypilot_place_id: 'v1', enrichment_status: 'provider_only', family_facilities: { toilets: 'yes' } }],
      claims: [
        { familypilot_place_id: 'v1', field_key: 'familyFacilities.toilets', value_json: 'yes', status: 'active', approved_by: 'source_evidence_auto_v2', valid_until: '2026-12-01', checked_at: '2026-09-01' },
        { familypilot_place_id: 'v1', field_key: 'familyFacilities.parking', value_json: 'yes', status: 'active', approved_by: 'ai_auto_approved', valid_until: '2026-12-01', checked_at: '2026-09-01' },
      ],
      pendingDrafts: [],
    }, TODAY);
    // Two claim rows, but only one the consumer path trusts.
    expect(rows[0].activeClaimCount).toBe(1);
    expect(rows[0].fieldStates.toilets).toBe('confirmed_fresh');
    expect(rows[0].fieldStates.parking).toBe('unknown');
    expect(consumerServesFacts(rows[0])).toBe(true);
  });

  it('flags a read-model value with no claim behind it', () => {
    const rows = buildVenueRows({
      places: [{ familypilot_place_id: 'v1', name: 'A', category: 'park', lat: 1, lng: 2 }],
      metadata: [{ familypilot_place_id: 'v1', enrichment_status: 'enriched', family_facilities: { babyChanging: 'yes' } }],
      claims: [],
      pendingDrafts: [],
    }, TODAY);
    expect(rows[0].fieldStates.baby_changing).toBe('unsupported');
  });

  it('treats an absent or empty provider field as missing', () => {
    expect(providerFieldPresent('photos', { photos: [] })).toBe(false);
    expect(providerFieldPresent('opening_hours', { opening_hours: {} })).toBe(false);
    expect(providerFieldPresent('location', { lat: null, lng: null })).toBe(false);
    expect(providerFieldPresent('identity_name', { name: '   ' })).toBe(false);
    expect(providerFieldPresent('photos', { photos: ['a'] })).toBe(true);
  });
});

describe('the audit cannot write, structurally', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const FORBIDDEN = [
    'createAgePolicyClaim', 'createApprovedClaim', 'replaceActiveClaim', 'saveMetadata',
    'saveEvidenceRecord', 'approveDraft', 'setClaimStatus', 'disputeClaim', 'expireClaim',
    '.insert(', '.update(', '.upsert(', '.delete(', '.rpc(',
  ];

  it.each([
    ['server/enrichment/_lib/venue-readiness-audit.js'],
    ['scripts/audit-venue-readiness.js'],
  ])('%s references no writer', (file) => {
    const source = fs.readFileSync(path.join(__dirname, '../../../', file), 'utf8');
    for (const forbidden of FORBIDDEN) {
      expect(source.includes(forbidden), `${file} must not reference ${forbidden}`).toBe(false);
    }
  });

});

/**
 * The source-integrity finding from review: production carries active claims whose source page
 * describes a DIFFERENT venue. These pin both what the heuristic catches and, just as importantly,
 * what it is known to miss, so nobody later reads `unestablished` as "probably fine".
 */
describe('source-to-venue affinity is a suspicion signal with known blind spots', () => {
  // The real catalogue rows these cases come from, so the fixtures cannot drift from production.
  const CATALOGUE = [
    { familypilot_place_id: 'tate-britain', website: 'https://www.tate.org.uk/visit/tate-britain' },
    { familypilot_place_id: 'tate-modern', website: 'https://www.tate.org.uk/visit/tate-modern' },
    { familypilot_place_id: 'vam-sk', website: 'https://www.vam.ac.uk/south-kensington' },
    { familypilot_place_id: 'vam-young', website: 'https://www.vam.ac.uk/young/' },
    { familypilot_place_id: 'vam-storehouse', website: 'https://www.vam.ac.uk/east/storehouse/visit' },
    { familypilot_place_id: 'flipout-watford', website: 'https://flipout.co.uk/locations/watford/?utm_source=x' },
    { familypilot_place_id: 'kensington-gardens', website: 'https://www.royalparks.org.uk/visit/parks/kensington-gardens' },
    { familypilot_place_id: 'diana-playground', website: 'https://www.royalparks.org.uk/visit/parks/kensington-gardens/diana-memorial-playground' },
  ];
  const slugs = otherVenueSlugsByHost(CATALOGUE);
  const site = (id: string) => CATALOGUE.find((p) => p.familypilot_place_id === id)!.website;
  const verdict = (id: string, sourceUrl: string | null) =>
    classifySourceAffinity({ sourceUrl, ownWebsite: site(id) }, slugs);

  it('every verdict is one of the three declared classes', () => {
    for (const row of CATALOGUE) {
      expect(SOURCE_AFFINITY).toContain(classifySourceAffinity({ sourceUrl: row.website, ownWebsite: row.website }, slugs));
    }
  });

  it('flags Tate Britain and Tate Modern carrying facts sourced from the Tate Liverpool page', () => {
    // Verified in production on 2026-09-26: three active facility facts each, same source URL.
    expect(verdict('tate-britain', 'https://www.tate.org.uk/visit/tate-liverpool')).toBe('contested');
    expect(verdict('tate-modern', 'https://www.tate.org.uk/visit/tate-liverpool')).toBe('contested');
  });

  it('flags the V&A carrying facts sourced from the Young V&A page, and the reverse', () => {
    expect(verdict('vam-sk', 'https://www.vam.ac.uk/young/visit')).toBe('contested');
    expect(verdict('vam-young', 'https://www.vam.ac.uk/south-kensington/visit')).toBe('contested');
  });

  /**
   * The blind spot, stated as a test so it cannot quietly be forgotten. `/wedgwood/visit` is the
   * Wedgwood Collection in Stoke-on-Trent, roughly 150 miles from South Kensington, and
   * `/east/storehouse/visit` is a different V&A site again -- but neither leaf is a catalogue
   * venue's slug, and both paths END in the generic segment `visit`, so no rule fires. Closing this
   * needs every discriminating path segment compared, not just the leaf; that is P0 Venue Source
   * Integrity, not this audit.
   */
  it('MISSES a wrong-venue source whose discriminating segment is not the leaf', () => {
    expect(verdict('vam-sk', 'https://www.vam.ac.uk/wedgwood/visit')).toBe('unestablished');
    expect(verdict('vam-sk', 'https://www.vam.ac.uk/east/storehouse/visit')).toBe('unestablished');
    expect(verdict('vam-young', 'https://www.vam.ac.uk/wedgwood/visit')).toBe('unestablished');
    // And the venue whose own website ends in `visit` has no usable leaf at all.
    expect(verdict('vam-storehouse', 'https://www.vam.ac.uk/east/museum/visit')).toBe('unestablished');
  });

  it("accepts a venue's own deeper page on its own site", () => {
    expect(verdict('flipout-watford', 'https://www.flipout.co.uk/locations/watford/frequently-asked-questions')).toBe('confirmed');
    expect(verdict('vam-young', 'https://www.vam.ac.uk/young/visit')).toBe('confirmed');
  });

  /**
   * An own-leaf match wins outright, BEFORE the other-venue rule. Production has five cells where a
   * venue sits inside a parent venue's path -- Diana Memorial Playground under Kensington Gardens,
   * Golders Hill Park under Hampstead Heath -- and the source IS that venue's own page. Reversing
   * the precedence turned all five into false alarms, which is how this test came to exist.
   */
  it('does not call a nested venue contested merely because its parent is also in the catalogue', () => {
    expect(verdict('diana-playground', site('diana-playground'))).toBe('confirmed');
  });

  it('a claim with no source URL establishes nothing', () => {
    expect(verdict('tate-britain', null)).toBe('unestablished');
  });

  it('a page shared site-wide, naming no venue, stays unestablished rather than contested', () => {
    expect(verdict('tate-britain', 'https://www.tate.org.uk/about-us')).toBe('unestablished');
  });

  it('the worst verdict wins per field when one field has several sources', () => {
    const rows = buildVenueRows({
      places: CATALOGUE,
      metadata: [{ familypilot_place_id: 'vam-sk', enrichment_status: 'enriched' }],
      claims: [
        { familypilot_place_id: 'vam-sk', field_key: 'familyFacilities.toilets', status: 'active',
          approved_by: 'source_evidence_auto_v2', valid_until: '2026-12-01', checked_at: '2026-09-01',
          value_json: 'yes', source_url: 'https://www.vam.ac.uk/south-kensington/plan-your-visit' },
        { familypilot_place_id: 'vam-sk', field_key: 'familyFacilities.toilets', status: 'active',
          approved_by: 'source_evidence_auto_v2', valid_until: '2026-12-01', checked_at: '2026-09-01',
          value_json: 'yes', source_url: 'https://www.vam.ac.uk/young/visit' },
      ],
    }, TODAY);
    expect(rows[0].affinityByField.toilets).toBe('contested');
  });
});

/**
 * Coverage is reported twice and the two figures must stay distinguishable: the consumer serves the
 * contested facts today, so collapsing them would misdescribe either what parents see or what the
 * evidence supports.
 */
describe('served coverage and identity-safe coverage are separate readings', () => {
  const places = [
    { familypilot_place_id: 'a', website: 'https://example.org/alpha-venue', lat: 1, lng: 2, name: 'A', category: 'park', photos: ['p'], opening_hours: { mon: 'x' } },
    { familypilot_place_id: 'b', website: 'https://example.org/beta-venue', lat: 1, lng: 2, name: 'B', category: 'park', photos: ['p'], opening_hours: { mon: 'x' } },
  ];
  const evidenced = (vid: string, fieldKey: string, sourceUrl: string) => ({
    familypilot_place_id: vid, field_key: fieldKey, status: 'active', approved_by: 'source_evidence_auto_v2',
    valid_until: '2026-12-01', checked_at: '2026-09-01', value_json: 'yes', source_url: sourceUrl,
  });

  const rows = buildVenueRows({
    places,
    metadata: [
      { familypilot_place_id: 'a', enrichment_status: 'enriched' },
      { familypilot_place_id: 'b', enrichment_status: 'enriched' },
    ],
    claims: [
      evidenced('a', 'familyFacilities.toilets', 'https://example.org/alpha-venue/facilities'),
      evidenced('a', 'environment', 'https://example.org/alpha-venue/facilities'),
      // b's facts are sourced from a's page: served, but not identity-safe.
      evidenced('b', 'familyFacilities.toilets', 'https://example.org/alpha-venue/facilities'),
      evidenced('b', 'environment', 'https://example.org/alpha-venue/facilities'),
    ],
  }, TODAY);
  const result = auditCatalogue(rows, {}, TODAY);

  it('serves four facts but vouches for only two', () => {
    expect(result.summary.servedFacts).toBe(4);
    expect(result.summary.identitySafeFacts).toBe(2);
    expect(result.summary.servedIdentitySafeFacts).toBe(2);
    expect(result.summary.contestedFacts).toBe(2);
  });

  it('demotes the contaminated venue only in the identity-safe tiering', () => {
    expect(result.summary.byTier.T3).toBe(2);
    expect(result.summary.byTierIdentitySafe.T3).toBe(1);
    expect(result.summary.byTierIdentitySafe.T1).toBe(1);
  });

  /**
   * No production venue is both consumer-blocked and holding usable facts today, so only a test can
   * hold this line. Both figures are about what a PARENT gets: a fact the consumer will not serve
   * is not served coverage, however good its source.
   */
  it('counts nothing as served for a venue the consumer projection blocks', () => {
    const blocked = buildVenueRows({
      places,
      metadata: [{ familypilot_place_id: 'a', enrichment_status: 'ai_draft' }],
      claims: [
        evidenced('a', 'familyFacilities.toilets', 'https://example.org/alpha-venue/facilities'),
        evidenced('a', 'environment', 'https://example.org/alpha-venue/facilities'),
      ],
    }, TODAY);
    const blockedResult = auditCatalogue(blocked, {}, TODAY);

    expect(blockedResult.summary.usableFacts).toBe(2);
    expect(blockedResult.summary.identitySafeFacts).toBe(2);
    expect(blockedResult.summary.servedFacts).toBe(0);
    expect(blockedResult.summary.servedIdentitySafeFacts).toBe(0);
    expect(blockedResult.byField.toilets.servableIdentitySafe).toBe(0);
    expect(blockedResult.byField.toilets.identitySafe).toBe(1);
    expect(blockedResult.summary.blockedHoldingUsableFacts).toBe(1);
    expect(blockedResult.summary.factsWithheldByConsumerBlock).toBe(2);
  });

  it('the strict reading never invents coverage the served reading lacks', () => {
    expect(result.summary.identitySafeFacts).toBeLessThanOrEqual(result.summary.usableFacts);
    expect(result.summary.explainableIdentitySafe).toBeLessThanOrEqual(result.summary.explainable);
  });
});

/**
 * `draftAssertsField` reads `VenueEnrichmentDraftJson`, whose shape is NOT the metadata payload's.
 * An earlier revision walked the metadata field names and handed whole objects to
 * `carriesInformation`, so `{ value: 'unknown' }` stringified as informative and became a false
 * candidate. Production's 67 pending drafts are all literally
 * `{"accessibility":{},"familyFacilities":{},"sendInfo":{}}`, so the live figure is zero either way
 * and only a test can tell the two implementations apart.
 */
describe('a draft candidate is read through the real draft schema', () => {
  const field = (key: string) => FIELD_INVENTORY.find((f: { key: string }) => f.key === key);

  it('reads a tri-state fact through .value, not the wrapper object', () => {
    expect(draftAssertsField({ familyFacilities: { toilets: { value: 'yes', confidence: 'high' } } }, field('toilets'))).toBe(true);
    expect(draftAssertsField({ familyFacilities: { toilets: { value: 'unknown', confidence: 'low' } } }, field('toilets'))).toBe(false);
  });

  it('reads visit duration from suggestedVisitDuration as a bare number', () => {
    expect(draftAssertsField({ suggestedVisitDuration: 90 }, field('visit_duration'))).toBe(true);
    expect(draftAssertsField({ suggestedVisitDuration: null }, field('visit_duration'))).toBe(false);
    // A scalar slot that holds something uninformative is not a candidate either. The generator has
    // historically written `unknown` into slots it could not fill, and an object here would be a
    // schema violation rather than a duration.
    expect(draftAssertsField({ suggestedVisitDuration: 'unknown' }, field('visit_duration'))).toBe(false);
    expect(draftAssertsField({ suggestedVisitDuration: '' }, field('visit_duration'))).toBe(false);
    expect(draftAssertsField({ suggestedVisitDuration: {} }, field('visit_duration'))).toBe(false);
  });

  it('reads recommended ages from either bound of recommendedAge', () => {
    expect(draftAssertsField({ recommendedAge: { min: 3, max: null } }, field('recommended_ages'))).toBe(true);
    expect(draftAssertsField({ recommendedAge: { min: null, max: 11 } }, field('recommended_ages'))).toBe(true);
    expect(draftAssertsField({ recommendedAge: { min: null, max: null, notes: 'lots of fun' } }, field('recommended_ages'))).toBe(false);
  });

  it('never makes a candidate of a field the draft schema cannot express', () => {
    for (const key of ['free_parking', 'playground', 'hard_age_restriction']) {
      expect(field(key).draft).toBeNull();
      expect(draftAssertsField({ familyFacilities: { freeParking: { value: 'yes' } }, agePolicy: { minMonths: 48 } }, field(key))).toBe(false);
    }
  });

  it("production's actual pending draft asserts nothing", () => {
    const real = { accessibility: {}, familyFacilities: {}, sendInfo: {} };
    for (const key of CLAIM_FIELD_KEYS) {
      expect(draftAssertsField(real, field(key)), `${key} must not be a candidate`).toBe(false);
    }
  });
});

/**
 * The snapshot is dated, so the predicate behind it has to be. Without an injectable date the
 * published baseline could not be replayed from the same rows, and any test pinning a date would
 * become a time bomb the day its fixture expiries passed.
 */
describe('a dated snapshot replays identically', () => {
  const expiring = claim({ validUntil: '2026-10-11' });

  it('isClaimActive honours the date it is given', () => {
    expect(isClaimActive(expiring, '2026-09-26')).toBe(true);
    expect(isClaimActive(expiring, '2026-10-11')).toBe(true);
    expect(isClaimActive(expiring, '2026-10-12')).toBe(false);
  });

  /**
   * Making the predicate date-injectable broke nine unrelated tests, because `getActiveClaims` was
   * calling `claims.filter(isClaimActive)` and `filter` hands the element INDEX to the second
   * parameter. A numeric date still compares as a string, so every claim read as active and the
   * damage surfaced far away from the cause. Both halves of the fix are pinned here.
   */
  it('refuses a non-string date rather than comparing against an array index', () => {
    expect(() => [expiring].filter(isClaimActive)).toThrow(/today must be an ISO date string/);
    expect(() => isClaimActive(expiring, 0 as unknown as string)).toThrow(TypeError);
  });

  it('defaults to the wall clock, so no production caller changes behaviour', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(isClaimActive(expiring)).toBe(isClaimActive(expiring, today));
  });

  it('the audit threads its snapshot date all the way to that predicate', () => {
    const rows = (today: string) => buildVenueRows({
      places: [{ familypilot_place_id: 'a', website: 'https://example.org/alpha-venue', lat: 1, lng: 2 }],
      metadata: [{ familypilot_place_id: 'a', enrichment_status: 'enriched' }],
      claims: [{
        familypilot_place_id: 'a', field_key: 'familyFacilities.toilets', status: 'active',
        approved_by: 'source_evidence_auto_v2', valid_until: '2026-10-11', checked_at: '2026-09-01',
        value_json: 'yes', source_url: 'https://example.org/alpha-venue/facilities',
      }],
    }, today);
    // The whole four-state lifecycle, driven only by the snapshot date: fresh, then due for
    // refresh inside REFRESH_LEAD_DAYS, then stale inside the grace window, then gone.
    expect(rows('2026-09-26')[0].fieldStates.toilets).toBe('confirmed_fresh');
    expect(rows('2026-09-26')[0].activeClaimCount).toBe(1);
    expect(rows('2026-10-04')[0].fieldStates.toilets).toBe('confirmed_refresh_due');
    expect(rows('2026-10-12')[0].fieldStates.toilets).toBe('stale');
    expect(rows('2026-10-25')[0].fieldStates.toilets).toBe('stale');
    expect(rows('2026-10-26')[0].fieldStates.toilets).toBe('unknown');
    // Trust ends the day the claim expires, whatever the field state says afterwards.
    expect(rows('2026-10-11')[0].activeClaimCount).toBe(1);
    expect(rows('2026-10-12')[0].activeClaimCount).toBe(0);
  });
});

/**
 * The corpus is hand-transferred through a chat context in md5-verified chunks, which is exactly
 * how a corpus once arrived eight rows short and still looked complete. The decoder is the second
 * line of defence, so its guards are tested rather than grepped for.
 */
describe('the offline corpus decoder refuses a damaged transfer', () => {
  const place = 'v1|https://example.org/alpha-venue|11111';
  const meta = 'v1|enriched|000000000000000';
  const claimLine = 'v1|familyFacilities.toilets|a|A|2026-12-01|2026-09-01|1|https://example.org/alpha-venue/facilities';
  const draft = 'v1|{"accessibility":{},"familyFacilities":{},"sendInfo":{}}';

  it('round-trips a well-formed corpus into rows the audit can classify', () => {
    const decoded = decodeCorpus({ places: place, metadata: meta, claims: claimLine, drafts: draft });
    expect(decoded.places[0].website).toBe('https://example.org/alpha-venue');
    expect(decoded.claims[0].status).toBe('active');
    expect(decoded.claims[0].approved_by).toBe('source_evidence_auto_v2');
    expect(decoded.pendingDrafts[0].draft_json).toEqual({ accessibility: {}, familyFacilities: {}, sendInfo: {} });

    const rows = buildVenueRows(decoded, TODAY);
    expect(rows[0].fieldStates.toilets).toBe('confirmed_fresh');
    expect(rows[0].affinityByField.toilets).toBe('confirmed');
    expect(rows[0].fieldStates.website).toBe('present');
  });

  it('carries the website verbatim, because affinity is computed from it', () => {
    expect(decodePlaceLine('v1|https://www.vam.ac.uk/young/|11111').website).toBe('https://www.vam.ac.uk/young/');
    expect(decodePlaceLine('v1||11110').website).toBeNull();
  });

  it('stands metadata values in on the right side of carriesInformation', () => {
    const none = decodeMetadataLine('v1|enriched|000000000000000');
    const all = decodeMetadataLine('v1|enriched|111111111111111');
    expect(carriesInformation(none.family_facilities?.toilets)).toBe(false);
    expect(carriesInformation(all.family_facilities?.toilets)).toBe(true);
    expect(carriesInformation(all.visit_duration_minutes)).toBe(true);
    expect(carriesInformation(all.min_recommended_age)).toBe(true);
    expect(carriesInformation(all.venue_age_policy)).toBe(true);
  });

  it('refuses a truncated line rather than classifying a short row', () => {
    expect(() => decodePlaceLine('v1|https://example.org/x', 7)).toThrow(/places line 7: expected 3 columns/);
    expect(() => decodeMetadataLine('v1|enriched|0000', 3)).toThrow(/expected 15 flags, got 4/);
    expect(() => decodeClaimLine('v1|toilets|a|A|2026-12-01|2026-09-01|1', 2)).toThrow(/claims line 2: expected 8 columns/);
  });

  it('refuses a foreign code rather than silently dropping the row', () => {
    expect(() => decodeClaimLine(claimLine.replace('|a|A|', '|Z|A|'))).toThrow(/unknown status code/);
    expect(() => decodeClaimLine(claimLine.replace('|a|A|', '|a|Z|'))).toThrow(/unknown approver code/);
    expect(() => decodeClaimLine(claimLine.replace('2026-12-01', '01/12/2026'))).toThrow(/valid_until .* is not an ISO date/);
    expect(() => decodeClaimLine(claimLine.replace('|1|https', '|2|https'))).toThrow(/carriesInformation flag/);
    expect(() => decodeMetadataLine('v1|enriched|00000000000000x')).toThrow(/are not 0\/1/);
    expect(() => decodeDraftLine('v1|{not json}')).toThrow(/is not JSON/);
  });

  it('refuses a corpus whose files disagree about which venues exist', () => {
    expect(() => decodeCorpus({ places: place, metadata: 'v2|enriched|000000000000000', claims: '', drafts: '' }))
      .toThrow(/metadata references v2, which is not in places/);
    expect(() => decodeCorpus({ places: place, metadata: meta, claims: claimLine.replace(/^v1/, 'v9'), drafts: '' }))
      .toThrow(/claims references v9/);
  });
});

/**
 * The published baseline, replayed from the committed snapshot.
 *
 * Every number in `docs/VENUE_INTELLIGENCE_BASELINE.md` is pinned here, so the report cannot drift
 * away from the code that produced it and nobody has to take the figures on trust. The snapshot's
 * checksums are recorded in its README and were verified against production on 2026-09-26; each
 * figure below was also reproduced by SQL written separately against the same rules.
 */
describe('the published 2026-09-26 baseline replays from the committed snapshot', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const crypto = require('node:crypto');
  const dir = path.join(__dirname, '../../../docs/snapshots/venue-intelligence-2026-09-26');
  const read = (name: string) => fs.readFileSync(path.join(dir, name), 'utf8');

  const corpus = decodeCorpus({
    places: read('places.txt'),
    metadata: read('meta.txt'),
    claims: read('claims.txt'),
    drafts: read('drafts.txt'),
  });
  const rows = buildVenueRows(corpus, TODAY);
  const { summary, byField } = auditCatalogue(rows, { expected: { venues: 134 } }, TODAY);

  it('the snapshot on disk is the one the report was computed from', () => {
    // The transport is a chat context, which has silently truncated a corpus before.
    const md5 = (name: string) => crypto.createHash('md5').update(read(name).replace(/\n$/, '')).digest('hex');
    expect(md5('places.txt')).toBe('77a02bd82d101697a69a3c7b3b26b638');
    expect(md5('meta.txt')).toBe('f8ab1d7c46eafe93baddb25d6eaf5b2e');
    expect(md5('claims.txt')).toBe('9ead99b7c1ec41f6bb21d0060e235e14');
    expect(md5('drafts.txt')).toBe('eccd695c2f7de00bd28454be24248682');
    expect(corpus.places).toHaveLength(134);
    expect(corpus.metadata).toHaveLength(134);
    expect(corpus.claims).toHaveLength(345);
    expect(corpus.pendingDrafts).toHaveLength(67);
  });

  it('every ledger balances against its own denominator', () => {
    expect(summary.venues).toBe(134);
    expect(summary.reconciles).toBe(true);
    expect(summary.claimCells).toBe(2010);
    expect(summary.claimLedgerBalances).toBe(true);
    expect(summary.providerLedgerBalances).toBe(true);
    expect(summary.derivedLedgerBalances).toBe(true);
  });

  it('reports the published tier distribution, served and identity-safe', () => {
    expect(summary.byTier).toEqual({ T0: 67, T2: 53, T3: 14 });
    expect(summary.byTierIdentitySafe).toEqual({ T0: 67, T1: 42, T2: 23, T3: 2 });
    expect(summary.recommendationReady).toBe(0);
    expect(summary.explainable).toBe(14);
    expect(summary.explainableIdentitySafe).toBe(2);
  });

  it('reports the published coverage and affinity split', () => {
    expect(summary.usableFacts).toBe(223);
    expect(summary.servedFacts).toBe(223);
    expect(summary.sourceAffinityTotals).toEqual({ confirmed: 55, contested: 20, unestablished: 148 });
    expect(summary.identitySafeFacts).toBe(55);
    expect(summary.servedIdentitySafeFacts).toBe(55);
  });

  it('reports the published per-field coverage', () => {
    const published: Record<string, [number, number]> = {
      accessible_toilet: [39, 10], playground: [35, 16], parking: [29, 7], baby_changing: [27, 3],
      toilets: [25, 3], free_parking: [20, 2], wheelchair_access: [19, 6], environment: [18, 7],
      pushchair_suitability: [8, 0], sensory_sessions: [2, 0], cafe_on_site: [1, 1],
      energy_level: [0, 0], visit_duration: [0, 0], recommended_ages: [0, 0], hard_age_restriction: [0, 0],
    };
    for (const [key, [usable, safe]] of Object.entries(published)) {
      expect([key, byField[key].usable, byField[key].servableIdentitySafe]).toEqual([key, usable, safe]);
      // Nothing usable is withheld: no venue holding a usable claim is consumer-blocked.
      expect(byField[key].servable).toBe(usable);
    }
  });

  it('reports the published claim-state ledger', () => {
    expect(summary.claimStateTotals).toEqual({
      confirmed_fresh: 223, confirmed_refresh_due: 0, stale: 0, conflicting: 2,
      candidate_not_publishable: 0, unsupported: 0, unknown: 1785,
    });
  });

  it('reports the published provider availability', () => {
    for (const [key, present] of Object.entries({
      identity_name: 134, location: 134, category: 134, photos: 128, opening_hours: 118, website: 128,
    })) {
      expect([key, byField[key].present]).toEqual([key, present]);
    }
    expect(byField.nearby_restaurants.available).toBe(134);
  });

  it('finds the Tate and V&A contamination, and still misses the wedgwood-class cases', () => {
    const affinityOf = (website: string, field: string) =>
      rows.find((r: { familypilotPlaceId: string }) =>
        corpus.places.find((p: { familypilot_place_id: string; website: string }) =>
          p.familypilot_place_id === r.familypilotPlaceId && p.website === website))
        ?.affinityByField[field];

    expect(affinityOf('https://www.tate.org.uk/visit/tate-britain', 'toilets')).toBe('contested');
    expect(affinityOf('https://www.tate.org.uk/visit/tate-modern', 'toilets')).toBe('contested');
    // The V&A's toilets fact is sourced from the Wedgwood Collection in Stoke-on-Trent and is NOT
    // caught, because `/wedgwood/visit` ends in a generic segment and `wedgwood` is not a
    // catalogue slug. Documented in the report as a known blind spot, pinned here so a future
    // change that closes it has to update this expectation deliberately.
    expect(affinityOf('https://www.vam.ac.uk/south-kensington', 'toilets')).toBe('unestablished');
    expect(affinityOf('https://www.vam.ac.uk/south-kensington', 'parking')).toBe('contested');
  });

  it('holds no draft candidate at all, because all 67 pending drafts are empty', () => {
    expect(summary.claimStateTotals.candidate_not_publishable).toBe(0);
    for (const draft of corpus.pendingDrafts) {
      expect(draft.draft_json).toEqual({ accessibility: {}, familyFacilities: {}, sendInfo: {} });
    }
  });
});
