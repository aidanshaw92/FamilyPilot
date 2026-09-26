/**
 * P0 Venue Intelligence: is there enough trustworthy evidence to recommend a venue to a family?
 *
 * WRITES NOTHING. It reads what is already stored and classifies it. A test asserts this file
 * names no writer, so a future edit that reaches for one fails there rather than in production.
 *
 * The question this exists to answer is not "how full is the database". It is:
 *
 *   for how many venues can FamilyPilot tell a parent, with evidence it can stand behind,
 *   whether this place works for their family and their day?
 *
 * Three rules govern every number here, and the first revision of this audit got all three wrong.
 *
 * 1. TRUST IS NOT REINVENTED. `isClaimActive` from claims-store is the predicate the consumer path
 *    itself uses, so it is imported rather than reimplemented. It accepts a source-evidence
 *    auto-published claim, because the product deliberately trusts those for ordinary facility
 *    facts, and rejects the legacy `ai_auto_approved` approver that predates source proof. The
 *    strict `human:` requirement belongs to age-policy gating alone, not to the catalogue. The
 *    first revision described its coverage as "human-approved"; production holds 223 active
 *    `source_evidence_auto_v2` claims, 4 editor claims and zero `human:` claims, so that
 *    description was simply false.
 *
 * 2. SERVABILITY FOLLOWS THE CONSUMER PATH, NOT THE RAW STATUS COLUMN. `getConsumerMetadata` hard-
 *    stops on `ai_draft` only; a `provider_only` row with active claims is projected and returned
 *    as consumer-`enriched`. The first revision treated `provider_only` as gated and so reported
 *    facts as "thrown away" that the server is designed to serve.
 *
 * 3. A CANDIDATE IS A FIELD, NOT A VENUE. A pending draft makes a field a candidate only if the
 *    draft actually asserts something for THAT field. The first revision set one per-venue flag and
 *    applied it to every field, which is how it reported 1,004 candidate cells for 67 drafts that
 *    between them assert nothing at all.
 *
 * Provider availability and derived capability are kept OUT of the claim-state ledger. Having
 * coordinates means Eat Nearby can answer a question; it is not a fresh evidence-backed claim, and
 * mixing the two made a headline "38.4% confirmed_fresh" that meant nothing.
 */

const { isClaimActive } = require('./claims-store');

/** The one status the consumer projection refuses outright. */
const CONSUMER_BLOCKED_STATUS = 'ai_draft';

/** Values a claim or read-model field can carry that assert nothing, and so are not coverage. */
const EMPTY_VALUES = new Set(['unknown', '', 'null']);

/** Days before `validUntil` at which the replenisher should already be queueing a refresh. */
const REFRESH_LEAD_DAYS = 7;
/** Days past `validUntil` a claim may still be shown, and only when grace was earned. */
const GRACE_DAYS = 14;

/**
 * The facts a parent's decision rests on, and where each one comes from.
 *
 * `origin` decides which ledger a field belongs to and how expensive it is to improve: `provider`
 * arrives with the place record, `claim` needs a page fetched, a fact extracted and a publish
 * decision, and `derived` should not be stored at all.
 */
const FIELD_INVENTORY = [
  { key: 'identity_name',         origin: 'provider', group: 'identity' },
  { key: 'location',              origin: 'provider', group: 'identity' },
  { key: 'category',              origin: 'provider', group: 'identity' },
  { key: 'photos',                origin: 'provider', group: 'presentation' },
  { key: 'opening_hours',         origin: 'provider', group: 'planning' },
  { key: 'website',               origin: 'provider', group: 'sourcing' },

  { key: 'toilets',               origin: 'claim', claimKey: 'familyFacilities.toilets',            draftPath: ['familyFacilities', 'toilets'],            group: 'facilities' },
  { key: 'baby_changing',         origin: 'claim', claimKey: 'familyFacilities.babyChanging',       draftPath: ['familyFacilities', 'babyChanging'],       group: 'facilities' },
  { key: 'accessible_toilet',     origin: 'claim', claimKey: 'accessibility.accessibleToilet',      draftPath: ['accessibility', 'accessibleToilet'],      group: 'accessibility' },
  { key: 'wheelchair_access',     origin: 'claim', claimKey: 'accessibility.wheelchairAccessible',  draftPath: ['accessibility', 'wheelchairAccessible'],  group: 'accessibility' },
  { key: 'pushchair_suitability', origin: 'claim', claimKey: 'pushchairSuitability',                draftPath: ['pushchairSuitability'],                   group: 'accessibility' },
  { key: 'parking',               origin: 'claim', claimKey: 'familyFacilities.parking',            draftPath: ['familyFacilities', 'parking'],            group: 'logistics' },
  { key: 'free_parking',          origin: 'claim', claimKey: 'familyFacilities.freeParking',        draftPath: ['familyFacilities', 'freeParking'],        group: 'logistics' },
  { key: 'cafe_on_site',          origin: 'claim', claimKey: 'familyFacilities.cafe',               draftPath: ['familyFacilities', 'cafe'],               group: 'facilities' },
  { key: 'playground',            origin: 'claim', claimKey: 'familyFacilities.playground',         draftPath: ['familyFacilities', 'playground'],         group: 'facilities' },
  { key: 'sensory_sessions',      origin: 'claim', claimKey: 'sendInfo.sensoryFriendlySessions',    draftPath: ['sendInfo', 'sensoryFriendlySessions'],    group: 'accessibility' },
  { key: 'environment',           origin: 'claim', claimKey: 'environment',                         draftPath: ['environment'],                            group: 'day_shape' },
  { key: 'energy_level',          origin: 'claim', claimKey: 'energyLevel',                         draftPath: ['energyLevel'],                            group: 'day_shape' },
  { key: 'visit_duration',        origin: 'claim', claimKey: 'visitDurationMinutes',                draftPath: ['visitDurationMinutes'],                   group: 'planning' },
  { key: 'recommended_ages',      origin: 'claim', claimKey: 'minRecommendedAge',                   draftPath: ['minRecommendedAge'],                      group: 'age' },
  { key: 'hard_age_restriction',  origin: 'claim', claimKey: 'agePolicy',                           draftPath: ['venueAgePolicy'],                         group: 'age' },

  { key: 'nearby_restaurants',    origin: 'derived', group: 'planning',
    note: 'Eat Nearby resolves this at request time from location; storing it would duplicate state.' },
];

const CLAIM_FIELDS = FIELD_INVENTORY.filter((f) => f.origin === 'claim');
const CLAIM_FIELD_KEYS = CLAIM_FIELDS.map((f) => f.key);
const PROVIDER_FIELD_KEYS = FIELD_INVENTORY.filter((f) => f.origin === 'provider').map((f) => f.key);
const DERIVED_FIELD_KEYS = FIELD_INVENTORY.filter((f) => f.origin === 'derived').map((f) => f.key);

/**
 * The states a CLAIM-backed field can be in. Provider and derived fields have their own, smaller
 * vocabularies, deliberately: "the venue has a photo" and "a source confirmed baby changing three
 * days ago" are not the same kind of statement and must not share a bucket.
 */
const CLAIM_STATES = [
  'confirmed_fresh',
  'confirmed_refresh_due',
  'stale',
  'conflicting',
  'candidate_not_publishable',
  'unsupported',
  'unknown',
];
const PROVIDER_STATES = ['present', 'missing'];
const DERIVED_STATES = ['available', 'unavailable'];

function addDays(isoDate, days) {
  const date = new Date(`${String(isoDate).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Whether a value asserts anything a parent could act on.
 *
 * Separate from trust on purpose. A claim valued `unknown` is perfectly valid and perfectly
 * trusted -- a source was read and said nothing -- but it is not coverage. Three such claims exist
 * in production and the first revision counted them, inflating two fields.
 */
function carriesInformation(raw) {
  if (raw == null) return false;
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  if (text === '{}' || text === '[]') return false;
  return !EMPTY_VALUES.has(String(text).replace(/^"|"$/g, '').trim().toLowerCase());
}

/**
 * Whether the consumer path would serve this venue's claim-backed facts at all.
 *
 * Mirrors `getConsumerMetadata`: `ai_draft` returns null outright, and so does a venue with no
 * active claims. Anything else -- `provider_only` included -- is projected and returned as
 * consumer-`enriched`.
 */
function consumerServesFacts({ enrichmentStatus, activeClaimCount = 0 }) {
  if (enrichmentStatus === CONSUMER_BLOCKED_STATUS) return false;
  return activeClaimCount > 0;
}

/** One claim-backed (venue, field) pair's state. */
function classifyClaimField({ claims = [], draftAsserts = false, metadataHasValue = false }, today) {
  const usable = claims.filter((c) => isClaimActive(c) && carriesInformation(c.value));

  for (const c of usable) {
    const until = c.validUntil ? String(c.validUntil).slice(0, 10) : null;
    if (!until) continue;
    if (today <= until) {
      return today >= addDays(until, -REFRESH_LEAD_DAYS) ? 'confirmed_refresh_due' : 'confirmed_fresh';
    }
  }

  /**
   * Past its lifetime but inside the grace window. Real grace also requires the claim's own source
   * to have failed TRANSIENTLY, which this audit cannot see from claim rows alone -- so this is an
   * upper bound, and the report says so rather than presenting it as exact.
   */
  const informative = claims.filter((c) => carriesInformation(c.value) && c.approvedBy !== 'ai_auto_approved');
  const inGrace = informative.some((c) => {
    const until = c.validUntil ? String(c.validUntil).slice(0, 10) : null;
    return until && today > until && today <= addDays(until, GRACE_DAYS);
  });
  if (inGrace) return 'stale';

  if (claims.some((c) => c.status === 'disputed')) return 'conflicting';

  if (metadataHasValue && usable.length === 0) return 'unsupported';
  // Field-specific: only a draft that asserts something for THIS field makes it a candidate.
  if (draftAsserts) return 'candidate_not_publishable';
  return 'unknown';
}

function claimStateIsUsable(state) {
  return state === 'confirmed_fresh' || state === 'confirmed_refresh_due';
}

/**
 * Recommendation readiness, in tiers rather than one percentage.
 *
 * Cumulative, and each tier names what FamilyPilot can actually SAY. T4's requirements are the day
 * planner's real inputs: without a visit duration it cannot place the venue in a day, and without
 * recommended ages it cannot rank it for these children.
 */
function readinessTier(venue) {
  const usable = new Set(CLAIM_FIELD_KEYS.filter((key) => claimStateIsUsable(venue.fieldStates?.[key] ?? 'unknown')));
  const has = (field) => usable.has(field);
  const facilityCount = ['toilets', 'baby_changing', 'parking', 'free_parking'].filter(has).length;

  if (!consumerServesFacts(venue)) {
    const why = venue.enrichmentStatus === CONSUMER_BLOCKED_STATUS
      ? 'ai_draft: the consumer projection returns nothing at all'
      : 'no active claims, so the consumer projection returns nothing to serve';
    return { tier: 'T0', label: 'consumer serves no family facts', reason: why, usableFacts: usable.size };
  }
  if (usable.size === 0) {
    return { tier: 'T1', label: 'identity only: servable, zero usable facts', reason: 'active claims exist but none carry information', usableFacts: 0 };
  }
  if (facilityCount >= 1 && has('environment') && has('pushchair_suitability') && has('visit_duration') && has('recommended_ages')) {
    return { tier: 'T4', label: 'confidently recommendable', reason: 'facility, environment, pushchair, duration and ages all usable', usableFacts: usable.size };
  }
  if (facilityCount >= 1 && has('environment')) {
    return { tier: 'T3', label: 'explainable: facility + environment', reason: 'enough to say why it suits a family, not enough to place it in a day', usableFacts: usable.size };
  }
  return { tier: 'T2', label: 'thin: some facts, no coherent story', reason: 'facts exist but not the combination an explanation needs', usableFacts: usable.size };
}

/**
 * The catalogue-level audit.
 *
 * Three ledgers, not one, so each percentage has a denominator that means something:
 * claim cells (venues x claim fields), provider cells, derived cells.
 */
function auditCatalogue(venues, { expected = {} } = {}, today = new Date().toISOString().slice(0, 10)) {
  const byField = {};
  const byTier = {};
  const claimStateTotals = Object.fromEntries(CLAIM_STATES.map((s) => [s, 0]));
  const providerStateTotals = Object.fromEntries(PROVIDER_STATES.map((s) => [s, 0]));
  const derivedStateTotals = Object.fromEntries(DERIVED_STATES.map((s) => [s, 0]));
  const blockedHoldingUsableFacts = [];

  for (const field of FIELD_INVENTORY) {
    const states = field.origin === 'claim' ? CLAIM_STATES : field.origin === 'provider' ? PROVIDER_STATES : DERIVED_STATES;
    byField[field.key] = { origin: field.origin, ...Object.fromEntries(states.map((s) => [s, 0])), usable: 0, servable: 0 };
  }

  for (const venue of venues) {
    const serves = consumerServesFacts(venue);
    byTier[readinessTier(venue).tier] = (byTier[readinessTier(venue).tier] ?? 0) + 1;

    let usableClaimFacts = 0;
    for (const field of FIELD_INVENTORY) {
      const state = venue.fieldStates?.[field.key] ?? (field.origin === 'claim' ? 'unknown' : field.origin === 'provider' ? 'missing' : 'unavailable');
      const totals = field.origin === 'claim' ? claimStateTotals : field.origin === 'provider' ? providerStateTotals : derivedStateTotals;
      if (!(state in totals)) throw new Error(`state ${state} is not valid for ${field.origin} field ${field.key}`);
      totals[state] += 1;
      byField[field.key][state] += 1;

      if (field.origin === 'claim') {
        if (claimStateIsUsable(state)) {
          byField[field.key].usable += 1;
          usableClaimFacts += 1;
          // Only the consumer block can withhold a claim-backed fact.
          if (serves) byField[field.key].servable += 1;
        }
      } else if (state === 'present' || state === 'available') {
        byField[field.key].usable += 1;
        // Provider and derived fields are served whatever the enrichment status is.
        byField[field.key].servable += 1;
      }
    }

    if (!serves && usableClaimFacts > 0) {
      blockedHoldingUsableFacts.push({ familypilotPlaceId: venue.familypilotPlaceId, enrichmentStatus: venue.enrichmentStatus, usableFacts: usableClaimFacts });
    }
  }

  const claimCells = venues.length * CLAIM_FIELDS.length;
  const providerCells = venues.length * PROVIDER_FIELD_KEYS.length;
  const derivedCells = venues.length * DERIVED_FIELD_KEYS.length;
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

  return {
    summary: {
      venues: venues.length,
      claimFields: CLAIM_FIELDS.length,
      providerFields: PROVIDER_FIELD_KEYS.length,
      derivedFields: DERIVED_FIELD_KEYS.length,
      claimCells,
      providerCells,
      derivedCells,
      /** Each ledger balances on its own, which is the only way its percentages mean anything. */
      claimLedgerBalances: sum(claimStateTotals) === claimCells,
      providerLedgerBalances: sum(providerStateTotals) === providerCells,
      derivedLedgerBalances: sum(derivedStateTotals) === derivedCells,
      claimStateTotals,
      providerStateTotals,
      derivedStateTotals,
      byTier,
      recommendationReady: byTier.T4 ?? 0,
      explainable: (byTier.T4 ?? 0) + (byTier.T3 ?? 0),
      consumerServesNothing: byTier.T0 ?? 0,
      blockedHoldingUsableFacts: blockedHoldingUsableFacts.length,
      factsWithheldByConsumerBlock: blockedHoldingUsableFacts.reduce((a, v) => a + v.usableFacts, 0),
      expectedVenues: expected.venues ?? null,
      unexplainedVenues: expected.venues == null ? null : expected.venues - venues.length,
      reconciles: expected.venues == null ? null : expected.venues === venues.length,
      today,
    },
    byField,
    blockedHoldingUsableFacts,
  };
}

/** Read the value the read model currently carries for a claim-backed field. */
const METADATA_READERS = {
  toilets: (m) => m.family_facilities?.toilets,
  baby_changing: (m) => m.family_facilities?.babyChanging,
  parking: (m) => m.family_facilities?.parking,
  free_parking: (m) => m.family_facilities?.freeParking,
  cafe_on_site: (m) => m.family_facilities?.cafe,
  playground: (m) => m.family_facilities?.playground,
  accessible_toilet: (m) => m.accessibility?.accessibleToilet,
  wheelchair_access: (m) => m.accessibility?.wheelchairAccessible,
  sensory_sessions: (m) => m.send_info?.sensoryFriendlySessions,
  pushchair_suitability: (m) => m.pushchair_suitability,
  environment: (m) => m.environment,
  energy_level: (m) => m.energy_level,
  visit_duration: (m) => m.visit_duration_minutes,
  recommended_ages: (m) => m.min_recommended_age ?? m.max_recommended_age,
  hard_age_restriction: (m) => m.venue_age_policy,
};

/** Whether a provider-supplied field is present. */
function providerFieldPresent(key, place) {
  if (!place) return false;
  switch (key) {
    case 'identity_name': return typeof place.name === 'string' && place.name.trim() !== '';
    case 'category': return typeof place.category === 'string' && place.category.trim() !== '';
    case 'website': return typeof place.website === 'string' && place.website.trim() !== '';
    case 'photos': return Array.isArray(place.photos) && place.photos.length > 0;
    case 'opening_hours': {
      const hours = place.opening_hours;
      if (hours == null) return false;
      if (Array.isArray(hours)) return hours.length > 0;
      return typeof hours === 'object' ? Object.keys(hours).length > 0 : Boolean(hours);
    }
    case 'location': return place.lat != null && place.lng != null;
    default: return false;
  }
}

/** Whether a draft asserts a usable candidate for one specific field. */
function draftAssertsField(draftJson, field) {
  if (!draftJson || !field.draftPath) return false;
  let node = draftJson;
  for (const step of field.draftPath) {
    if (node == null || typeof node !== 'object') return false;
    node = node[step];
  }
  return carriesInformation(node);
}

/** Turn raw table rows into the shape `auditCatalogue` consumes. */
function buildVenueRows({ places = [], metadata = [], claims = [], pendingDrafts = [] }, today = new Date().toISOString().slice(0, 10)) {
  const placeById = new Map(places.map((p) => [p.familypilot_place_id, p]));
  const draftById = new Map(pendingDrafts.map((d) => [d.familypilot_place_id, d.draft_json]));

  const claimsByVenue = new Map();
  for (const row of claims) {
    const claim = {
      status: row.status,
      approvedBy: row.approved_by,
      validUntil: row.valid_until,
      checkedAt: row.checked_at,
      value: row.value_json,
      fieldKey: row.field_key,
    };
    if (!claimsByVenue.has(row.familypilot_place_id)) claimsByVenue.set(row.familypilot_place_id, []);
    claimsByVenue.get(row.familypilot_place_id).push(claim);
  }

  return metadata.map((m) => {
    const place = placeById.get(m.familypilot_place_id);
    const draftJson = draftById.get(m.familypilot_place_id) ?? null;
    const venueClaims = claimsByVenue.get(m.familypilot_place_id) ?? [];
    // The same count `getConsumerMetadata` decides on: active, trusted, unexpired.
    const activeClaimCount = venueClaims.filter(isClaimActive).length;

    const fieldStates = {};
    for (const field of FIELD_INVENTORY) {
      if (field.origin === 'provider') {
        fieldStates[field.key] = providerFieldPresent(field.key, place) ? 'present' : 'missing';
        continue;
      }
      if (field.origin === 'derived') {
        // Coordinates are all Eat Nearby needs; this is capability, never confirmed data.
        fieldStates[field.key] = place?.lat != null && place?.lng != null ? 'available' : 'unavailable';
        continue;
      }
      const forField = venueClaims.filter(
        (c) => c.fieldKey === field.claimKey || String(c.fieldKey).startsWith(`${field.claimKey}.`),
      );
      fieldStates[field.key] = classifyClaimField(
        {
          claims: forField,
          draftAsserts: draftAssertsField(draftJson, field),
          metadataHasValue: carriesInformation(METADATA_READERS[field.key]?.(m)),
        },
        today,
      );
    }

    return {
      familypilotPlaceId: m.familypilot_place_id,
      enrichmentStatus: m.enrichment_status ?? 'provider_only',
      activeClaimCount,
      fieldStates,
    };
  });
}

module.exports = {
  FIELD_INVENTORY,
  CLAIM_FIELD_KEYS,
  PROVIDER_FIELD_KEYS,
  DERIVED_FIELD_KEYS,
  CLAIM_STATES,
  PROVIDER_STATES,
  DERIVED_STATES,
  CONSUMER_BLOCKED_STATUS,
  REFRESH_LEAD_DAYS,
  GRACE_DAYS,
  carriesInformation,
  consumerServesFacts,
  classifyClaimField,
  claimStateIsUsable,
  readinessTier,
  auditCatalogue,
  buildVenueRows,
  draftAssertsField,
  providerFieldPresent,
};
