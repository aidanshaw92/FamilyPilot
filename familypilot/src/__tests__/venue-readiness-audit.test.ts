import { describe, expect, it } from 'vitest';

const {
  FIELD_INVENTORY,
  FIELD_STATES,
  CLAIM_FIELD_KEYS,
  buildVenueRows,
  metadataHasValue,
  providerFieldPresent,
  claimSaysSomething,
  claimIsTrustworthy,
  classifyFieldState,
  stateIsUsable,
  readinessTier,
  auditCatalogue,
} = require('../../../server/enrichment/_lib/venue-readiness-audit');

/**
 * P0 Venue Intelligence: the baseline audit's own tests.
 *
 * The audit's job is to say how much FamilyPilot can honestly tell a parent. Every metric below
 * could be made to look better by a small dishonesty, so each test pins the thing that stops it:
 * an `unknown` claim is not coverage, a provider field is not a family fact, and a percentage whose
 * denominator shifts is not a percentage.
 */

const TODAY = '2026-09-26';
const claim = (over: Record<string, unknown> = {}) => ({
  status: 'active',
  approvedBy: 'human:reviewer',
  validUntil: '2026-12-01',
  value: 'yes',
  fieldKey: 'familyFacilities.toilets',
  ...over,
});

describe('a claim only counts when it actually says something', () => {
  it('rejects a claim whose value is the string "unknown"', () => {
    /**
     * Three production claims carry the value "unknown". The first run of this audit counted them
     * as coverage, which inflated environment and invented a figure for energy_level. A source that
     * was read and had nothing to say is not evidence a parent can use.
     */
    expect(claimSaysSomething(claim({ value: 'unknown' }))).toBe(false);
    expect(claimSaysSomething(claim({ value: '"unknown"' }))).toBe(false);
    expect(claimSaysSomething(claim({ value: null }))).toBe(false);
    expect(claimSaysSomething(claim({ value: '' }))).toBe(false);
    expect(claimSaysSomething(claim({ value: 'yes' }))).toBe(true);
    expect(claimSaysSomething(claim({ value: 'difficult' }))).toBe(true);
  });

  it('does not trust a legacy automatic approval', () => {
    expect(claimIsTrustworthy(claim({ approvedBy: 'ai_auto_approved' }))).toBe(false);
    expect(claimIsTrustworthy(claim({ approvedBy: 'human:reviewer' }))).toBe(true);
  });

  it('classifies an unknown-valued in-date claim as unknown, not as coverage', () => {
    expect(classifyFieldState({ claims: [claim({ value: 'unknown' })] }, TODAY)).toBe('unknown');
  });
});

describe('the seven field states', () => {
  it.each([
    ['fresh', { claims: [claim({ validUntil: '2026-12-01' })] }, 'confirmed_fresh'],
    ['refresh due inside the lead window', { claims: [claim({ validUntil: '2026-09-30' })] }, 'confirmed_refresh_due'],
    ['past its lifetime but inside grace', { claims: [claim({ validUntil: '2026-09-20' })] }, 'stale'],
    ['long expired', { claims: [claim({ validUntil: '2026-01-01' })] }, 'unknown'],
    ['disputed', { claims: [claim({ status: 'disputed' })] }, 'conflicting'],
    ['a draft waiting for review', { claims: [], hasDraft: true }, 'candidate_not_publishable'],
    ['nothing at all', { claims: [] }, 'unknown'],
  ])('%s -> %s', (_label, input, expected) => {
    expect(classifyFieldState(input as Record<string, unknown>, TODAY)).toBe(expected);
  });

  it('separates a read-model value with no claim behind it from an absent one', () => {
    /**
     * `unsupported` is a TRUST problem and `unknown` is a COVERAGE problem. Collapsing them would
     * hide every value that reached the read model without evidence, which is the one failure the
     * single-writer design exists to prevent.
     */
    expect(classifyFieldState({ claims: [], metadataHasValue: true }, TODAY)).toBe('unsupported');
    expect(classifyFieldState({ claims: [], metadataHasValue: false }, TODAY)).toBe('unknown');
  });

  it('only fresh and refresh-due are usable by the matcher', () => {
    const usable = FIELD_STATES.filter(stateIsUsable);
    expect(usable).toEqual(['confirmed_fresh', 'confirmed_refresh_due']);
  });
});

describe('readiness counts family facts, not provider identity', () => {
  const states = (over: Record<string, string> = {}) => {
    const base: Record<string, string> = {};
    for (const field of FIELD_INVENTORY) {
      base[field.key] = field.origin === 'claim' ? 'unknown' : 'confirmed_fresh';
    }
    return { ...base, ...over };
  };

  it('a venue with every provider field and no family fact is T1, not partly ready', () => {
    /**
     * The defect this pins: counting provider fields made every venue look partly ready, put T1 at
     * zero, and reported 472 "facts discarded by the status gate" where the real number is 5. Name,
     * location, photos and opening hours are served whatever the enrichment status is.
     */
    const readiness = readinessTier({ enrichmentStatus: 'enriched', fieldStates: states() });
    expect(readiness.tier).toBe('T1');
    expect(readiness.usableFacts).toBe(0);
  });

  it('a gated venue is T0 however many facts it holds', () => {
    const full = states({ toilets: 'confirmed_fresh', environment: 'confirmed_fresh', pushchair_suitability: 'confirmed_fresh' });
    for (const status of ['ai_draft', 'provider_only']) {
      expect(readinessTier({ enrichmentStatus: status, fieldStates: full }).tier).toBe('T0');
    }
  });

  it('needs a facility AND environment to be explainable', () => {
    expect(readinessTier({ enrichmentStatus: 'enriched', fieldStates: states({ toilets: 'confirmed_fresh' }) }).tier).toBe('T2');
    expect(readinessTier({ enrichmentStatus: 'enriched', fieldStates: states({ environment: 'confirmed_fresh' }) }).tier).toBe('T2');
    expect(
      readinessTier({ enrichmentStatus: 'enriched', fieldStates: states({ toilets: 'confirmed_fresh', environment: 'confirmed_fresh' }) }).tier,
    ).toBe('T3');
  });

  it('reaches T4 only with the facts the day planner needs', () => {
    const nearly = states({ toilets: 'confirmed_fresh', environment: 'confirmed_fresh', pushchair_suitability: 'confirmed_fresh', recommended_ages: 'confirmed_fresh' });
    expect(readinessTier({ enrichmentStatus: 'enriched', fieldStates: nearly }).tier).toBe('T3');
    const ready = { ...nearly, visit_duration: 'confirmed_fresh' };
    expect(readinessTier({ enrichmentStatus: 'enriched', fieldStates: ready }).tier).toBe('T4');
  });

  it('claim-backed fields are derived from the inventory, so the two cannot drift', () => {
    expect(CLAIM_FIELD_KEYS).toEqual(FIELD_INVENTORY.filter((f: { origin: string }) => f.origin === 'claim').map((f: { key: string }) => f.key));
    expect(CLAIM_FIELD_KEYS).not.toContain('photos');
    expect(CLAIM_FIELD_KEYS).not.toContain('identity_name');
    expect(CLAIM_FIELD_KEYS).toContain('baby_changing');
  });
});

describe('the catalogue ledger, and a reconciliation that can fail', () => {
  const venue = (id: string, enrichmentStatus: string, over: Record<string, string> = {}) => {
    const fieldStates: Record<string, string> = {};
    for (const field of FIELD_INVENTORY) fieldStates[field.key] = 'unknown';
    return { familypilotPlaceId: id, enrichmentStatus, fieldStates: { ...fieldStates, ...over } };
  };

  it('books every venue/field pair in exactly one state', () => {
    const { summary } = auditCatalogue([venue('a', 'enriched'), venue('b', 'ai_draft')], {}, TODAY);
    expect(summary.cells).toBe(2 * FIELD_INVENTORY.length);
    expect(summary.accountsForEveryCell).toBe(true);
    const booked = Object.values(summary.byState).reduce((a, b) => (a as number) + (b as number), 0);
    expect(booked).toBe(summary.cells);
  });

  it('reports venues production has that the audit never received', () => {
    const { summary } = auditCatalogue([venue('a', 'enriched')], { expected: { venues: 3 } }, TODAY);
    expect(summary.unexplainedVenues).toBe(2);
    expect(summary.reconciles).toBe(false);
  });

  it('leaves the reconciliation unstated rather than claiming it', () => {
    const { summary } = auditCatalogue([venue('a', 'enriched')], {}, TODAY);
    expect(summary.expectedVenues).toBeNull();
    expect(summary.reconciles).toBeNull();
  });

  it('counts only claim-backed facts as discarded by the status gate', () => {
    const gatedWithFacts = venue('gated', 'ai_draft', { toilets: 'confirmed_fresh', photos: 'confirmed_fresh' });
    const { summary, gatedHoldingUsableFacts } = auditCatalogue([gatedWithFacts], {}, TODAY);
    expect(summary.gatedHoldingUsableFacts).toBe(1);
    // One, not two: the photo is served regardless of status.
    expect(summary.discardedUsableFacts).toBe(1);
    expect(gatedHoldingUsableFacts[0].familypilotPlaceId).toBe('gated');
  });

  it('does not subtract a provider field from the servable count of a gated venue', () => {
    const { byField } = auditCatalogue([venue('gated', 'ai_draft', { photos: 'confirmed_fresh', toilets: 'confirmed_fresh' })], {}, TODAY);
    expect(byField.photos.usableAndServable).toBe(1);
    expect(byField.toilets.usable).toBe(1);
    expect(byField.toilets.usableAndServable).toBe(0);
  });

  it('rejects a state it does not recognise instead of silently dropping the cell', () => {
    const broken = venue('a', 'enriched');
    broken.fieldStates.toilets = 'probably_fine';
    expect(() => auditCatalogue([broken], {}, TODAY)).toThrow(/unknown field state/);
  });
});

describe('the live path and the offline fixture agree', () => {
  it('builds the same states from raw rows as the fixture encodes', () => {
    const rows = buildVenueRows({
      places: [{ familypilot_place_id: 'v1', name: 'A Park', category: 'park', lat: 51.5, lng: -0.1, photos: ['p'], opening_hours: { mon: '9-5' }, website: 'https://a.test' }],
      metadata: [{ familypilot_place_id: 'v1', enrichment_status: 'enriched', family_facilities: { toilets: 'yes' }, environment: 'outdoor' }],
      claims: [
        { familypilot_place_id: 'v1', field_key: 'familyFacilities.toilets', value_json: 'yes', status: 'active', approved_by: 'human:r', valid_until: '2026-12-01' },
        { familypilot_place_id: 'v1', field_key: 'environment', value_json: 'outdoor', status: 'active', approved_by: 'human:r', valid_until: '2026-12-01' },
      ],
      pendingDrafts: [],
    }, TODAY);

    expect(rows).toHaveLength(1);
    expect(rows[0].fieldStates.toilets).toBe('confirmed_fresh');
    expect(rows[0].fieldStates.environment).toBe('confirmed_fresh');
    expect(rows[0].fieldStates.photos).toBe('confirmed_fresh');
    expect(rows[0].fieldStates.visit_duration).toBe('unknown');
    expect(readinessTier(rows[0]).tier).toBe('T3');
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

  it('treats an absent or empty provider field as unknown, not as present', () => {
    expect(providerFieldPresent('photos', { photos: [] })).toBe(false);
    expect(providerFieldPresent('opening_hours', { opening_hours: {} })).toBe(false);
    expect(providerFieldPresent('location', { lat: null, lng: null })).toBe(false);
    expect(providerFieldPresent('identity_name', { name: '   ' })).toBe(false);
    expect(providerFieldPresent('photos', { photos: ['a'] })).toBe(true);
  });

  it('does not read "unknown" out of the read model as a value', () => {
    expect(metadataHasValue('unknown')).toBe(false);
    expect(metadataHasValue('yes')).toBe(true);
    expect(metadataHasValue(90)).toBe(true);
    expect(metadataHasValue(null)).toBe(false);
  });
});

describe('the audit cannot write, structurally', () => {
  /**
   * The audit is defined as zero-write and "we checked once" is not a guarantee. This asserts
   * neither file so much as names a writer, so a future edit that reaches for one fails here
   * rather than in production.
   */
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

  it('the fixture decoder refuses a line with the wrong number of codes', () => {
    /**
     * A truncated transfer once made a corpus look complete when it was eight rows short. A short
     * line must fail loudly rather than silently decode into a venue with missing fields.
     */
    const source = fs.readFileSync(path.join(__dirname, '../../../scripts/audit-venue-readiness.js'), 'utf8');
    expect(source).toContain('expected ${FIELD_INVENTORY.length} state codes');
    expect(source).toContain('unknown state code');
  });
});
