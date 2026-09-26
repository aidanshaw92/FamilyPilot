import { describe, expect, it } from 'vitest';

const {
  FIELD_INVENTORY,
  CLAIM_FIELD_KEYS,
  PROVIDER_FIELD_KEYS,
  DERIVED_FIELD_KEYS,
  CLAIM_STATES,
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

  it('the fixture decoder refuses a truncated line or a foreign code', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../../scripts/audit-venue-readiness.js'), 'utf8');
    expect(source).toContain('expected ${FIELD_INVENTORY.length} state codes');
    expect(source).toContain('unknown state code');
  });
});
