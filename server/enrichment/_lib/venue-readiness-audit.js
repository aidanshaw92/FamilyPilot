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
 * Those are different questions, and a single completeness percentage answers neither. Three
 * separate things have to line up before a venue can be recommended with an explanation:
 *
 *   1. the fact exists and is in date          -- an active, human-approved, unexpired claim
 *   2. the fact says something                 -- a claim whose value is `unknown` is not coverage
 *   3. the venue is allowed to serve facts     -- `extractMatchableFacts` returns everything as
 *                                                 unknown for an unreviewed venue, whatever is
 *                                                 stored, so a gated venue's facts do not exist
 *                                                 as far as a parent is concerned
 *
 * Point 2 was a real defect in the first run of this audit: three claims whose value is the string
 * "unknown" were counted as coverage, inflating two fields. Point 3 is the largest single effect in
 * the catalogue and is invisible to any query that only counts rows.
 */

/** Statuses for which `isUnreviewedEnrichmentStatus` makes every fact unknown to the matcher. */
const GATED_STATUSES = new Set(['provider_only', 'ai_draft']);

/** A claim approver that predates the source-proof requirement, and is therefore not trusted. */
const UNTRUSTED_LEGACY_APPROVER = 'ai_auto_approved';

/** Values a claim can carry that assert nothing, and so are not coverage. */
const EMPTY_CLAIM_VALUES = new Set(['unknown', '', 'null']);

/** Days before `validUntil` at which the replenisher should already be queueing a refresh. */
const REFRESH_LEAD_DAYS = 7;
/** Days past `validUntil` a claim may still be shown, and only when grace was earned. */
const GRACE_DAYS = 14;

/**
 * The facts a parent's decision actually rests on, and where each one lives.
 *
 * `origin` matters for the implementation order: a `provider` field arrives with the place record
 * and is close to free, a `claim` field needs a page fetched, a fact extracted and a human to
 * approve it, and a `derived` field should not be stored at all.
 */
const FIELD_INVENTORY = [
  // Identity and location: provider-supplied, and the cheapest coverage in the catalogue.
  { key: 'identity_name',         origin: 'provider', group: 'identity' },
  { key: 'location',              origin: 'provider', group: 'identity' },
  { key: 'category',              origin: 'provider', group: 'identity' },
  { key: 'photos',                origin: 'provider', group: 'presentation' },
  { key: 'opening_hours',         origin: 'provider', group: 'planning' },
  { key: 'website',               origin: 'provider', group: 'sourcing' },

  // Facilities: what a parent with a baby or a toddler asks about first.
  { key: 'toilets',               origin: 'claim', claimKey: 'familyFacilities.toilets',            group: 'facilities' },
  { key: 'baby_changing',         origin: 'claim', claimKey: 'familyFacilities.babyChanging',       group: 'facilities' },
  { key: 'accessible_toilet',     origin: 'claim', claimKey: 'accessibility.accessibleToilet',      group: 'accessibility' },
  { key: 'wheelchair_access',     origin: 'claim', claimKey: 'accessibility.wheelchairAccessible',  group: 'accessibility' },
  { key: 'pushchair_suitability', origin: 'claim', claimKey: 'pushchairSuitability',                group: 'accessibility' },
  { key: 'parking',               origin: 'claim', claimKey: 'familyFacilities.parking',            group: 'logistics' },
  { key: 'free_parking',          origin: 'claim', claimKey: 'familyFacilities.freeParking',        group: 'logistics' },
  { key: 'cafe_on_site',          origin: 'claim', claimKey: 'familyFacilities.cafe',               group: 'facilities' },
  { key: 'playground',            origin: 'claim', claimKey: 'familyFacilities.playground',         group: 'facilities' },
  { key: 'sensory_sessions',      origin: 'claim', claimKey: 'sendInfo.sensoryFriendlySessions',    group: 'accessibility' },

  // The day-shape facts. All three are at zero coverage, which is why no venue reaches T4.
  { key: 'environment',           origin: 'claim', claimKey: 'environment',                         group: 'day_shape' },
  { key: 'energy_level',          origin: 'claim', claimKey: 'energyLevel',                         group: 'day_shape' },
  { key: 'visit_duration',        origin: 'claim', claimKey: 'visitDurationMinutes',                group: 'planning' },
  { key: 'recommended_ages',      origin: 'claim', claimKey: 'minRecommendedAge',                   group: 'age' },
  { key: 'hard_age_restriction',  origin: 'claim', claimKey: 'agePolicy',                           group: 'age' },

  /**
   * Computed per request from the family's location and the catalogue, so storing it per venue
   * would create a second copy to keep fresh for no gain. Listed so the inventory is the whole
   * picture rather than only the stored part.
   */
  { key: 'nearby_restaurants',    origin: 'derived', group: 'planning',
    note: 'Eat Nearby resolves this at request time from location; storing it would duplicate state.' },
];

/** The claim-backed subset: the facts a human approved from a source, and the only ones the
 * enrichment-status gate can withhold. Derived from the inventory so the two cannot drift. */
const CLAIM_FIELD_KEYS = FIELD_INVENTORY.filter((f) => f.origin === 'claim').map((f) => f.key);

/**
 * The seven states a (venue, field) pair can be in.
 *
 * `unsupported` and `unknown` are deliberately different. A value in the read model with no claim
 * behind it is a trust problem; an absent value is a coverage problem. Collapsing them would hide
 * the first kind entirely.
 */

const FIELD_STATES = [
  'confirmed_fresh',
  'confirmed_refresh_due',
  'stale',
  'conflicting',
  'candidate_not_publishable',
  'unsupported',
  'unknown',
];

function addDays(isoDate, days) {
  const date = new Date(`${String(isoDate).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Whether a claim's value asserts anything a parent could act on. */
function claimSaysSomething(claim) {
  const raw = claim?.value;
  if (raw == null) return false;
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  return !EMPTY_CLAIM_VALUES.has(String(text).replace(/^"|"$/g, '').trim().toLowerCase());
}

/** Whether a claim is the kind this product treats as trusted at all. */
function claimIsTrustworthy(claim) {
  return Boolean(claim) && claim.status === 'active' && claim.approvedBy !== UNTRUSTED_LEGACY_APPROVER;
}

/**
 * One (venue, field) pair's state.
 *
 * `claims` are every claim row for this venue and field, whatever their status. `hasDraft` says a
 * generated candidate is waiting for review, and `metadataHasValue` says the read model currently
 * carries a value, which is how `unsupported` is detected.
 */
function classifyFieldState({ claims = [], hasDraft = false, metadataHasValue = false }, today) {
  const trusted = claims.filter((c) => claimIsTrustworthy(c) && claimSaysSomething(c));

  for (const claim of trusted) {
    const until = claim.validUntil ? String(claim.validUntil).slice(0, 10) : null;
    if (!until) continue;
    if (today <= until) {
      return today >= addDays(until, -REFRESH_LEAD_DAYS) ? 'confirmed_refresh_due' : 'confirmed_fresh';
    }
  }

  /**
   * Past its lifetime but inside the grace window. Real grace also requires the claim's own source
   * to have failed TRANSIENTLY, which this audit cannot see from claim rows alone -- so this is an
   * upper bound on `stale`, and the report says so rather than presenting it as exact.
   */
  const inGraceWindow = trusted.some((c) => {
    const until = c.validUntil ? String(c.validUntil).slice(0, 10) : null;
    return until && today > until && today <= addDays(until, GRACE_DAYS);
  });
  if (inGraceWindow) return 'stale';

  if (claims.some((c) => c.status === 'disputed')) return 'conflicting';

  /**
   * A claim exists and is in date, but its value is `unknown`. Not coverage, and not a candidate
   * either: the source was read and had nothing to say. It counts as unknown, because that is what
   * it tells a parent.
   */
  const informativeExists = claims.some((c) => claimIsTrustworthy(c) && claimSaysSomething(c));

  if (metadataHasValue && !informativeExists) return 'unsupported';
  if (hasDraft) return 'candidate_not_publishable';
  if (claims.length > 0) return 'unknown';
  return 'unknown';
}

/** Whether a state means the matcher can use the fact today. */
function stateIsUsable(state) {
  return state === 'confirmed_fresh' || state === 'confirmed_refresh_due';
}

/**
 * Recommendation readiness, in tiers rather than one percentage.
 *
 * The tiers are cumulative and each one names what FamilyPilot can actually SAY at that level.
 * T4's requirements are the facts the day planner needs, not an arbitrary count: without a visit
 * duration it cannot place the venue in a day, and without recommended ages it cannot rank it for
 * these children.
 */
function readinessTier(venue) {
  /**
   * Only CLAIM-backed fields count towards readiness. A provider field -- name, location, photos,
   * opening hours -- is present for almost every venue and is served whatever the enrichment status
   * is, so counting it makes every venue look partly ready and makes the status gate look like it
   * discards identity data, which it does not. The first run of this audit did exactly that and
   * reported 472 "discarded facts" where the real figure is a handful.
   */
  const usable = new Set(
    CLAIM_FIELD_KEYS.filter((key) => stateIsUsable(venue.fieldStates?.[key] ?? 'unknown')),
  );

  const has = (field) => usable.has(field);
  const facilityCount = ['toilets', 'baby_changing', 'parking', 'free_parking'].filter(has).length;

  if (GATED_STATUSES.has(venue.enrichmentStatus)) {
    return {
      tier: 'T0',
      label: 'status-gated: serves no facts at all',
      reason: `enrichmentStatus=${venue.enrichmentStatus} makes every fact unknown to the matcher`,
      usableFacts: usable.size,
    };
  }
  if (usable.size === 0) {
    return { tier: 'T1', label: 'identity only: servable, zero facts', reason: 'no usable claim-backed fact', usableFacts: 0 };
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
 * `venues` carry `familypilotPlaceId`, `enrichmentStatus` and a `fieldStates` map. `expected`
 * supplies totals measured independently (by the SQL scan), so the ledger reconciles two
 * implementations rather than balancing against itself -- the same discipline P0-B3 needed after
 * its first version's metrics could not fail.
 */
function auditCatalogue(venues, { expected = {} } = {}, today = new Date().toISOString().slice(0, 10)) {
  const byField = {};
  const byTier = {};
  const byState = Object.fromEntries(FIELD_STATES.map((s) => [s, 0]));
  const gatedHoldingUsableFacts = [];

  for (const field of FIELD_INVENTORY) {
    byField[field.key] = Object.fromEntries(FIELD_STATES.map((s) => [s, 0]));
    byField[field.key].usable = 0;
    byField[field.key].usableAndServable = 0;
  }

  for (const venue of venues) {
    const gated = GATED_STATUSES.has(venue.enrichmentStatus);
    const readiness = readinessTier(venue);
    byTier[readiness.tier] = (byTier[readiness.tier] ?? 0) + 1;

    let usableClaimFactsHere = 0;
    for (const field of FIELD_INVENTORY) {
      const state = venue.fieldStates?.[field.key] ?? 'unknown';
      if (!(state in byState)) throw new Error(`unknown field state ${state} for ${field.key}`);
      byState[state] += 1;
      byField[field.key][state] += 1;
      if (stateIsUsable(state)) {
        byField[field.key].usable += 1;
        if (field.origin === 'claim') usableClaimFactsHere += 1;
        // A provider field is served whatever the enrichment status is, so the gate does not
        // subtract it. Only a claim-backed fact can be withheld by an unreviewed status.
        if (!gated || field.origin !== 'claim') byField[field.key].usableAndServable += 1;
      }
    }

    // Verified work the status gate is currently throwing away. Cheap to recover, so worth naming.
    if (gated && usableClaimFactsHere > 0) {
      gatedHoldingUsableFacts.push({ familypilotPlaceId: venue.familypilotPlaceId, usableFacts: usableClaimFactsHere });
    }
  }

  const cells = venues.length * FIELD_INVENTORY.length;
  const accountedCells = Object.values(byState).reduce((a, b) => a + b, 0);

  return {
    summary: {
      venues: venues.length,
      fields: FIELD_INVENTORY.length,
      cells,
      /** Every (venue, field) pair lands in exactly one state, or this is false. */
      accountsForEveryCell: accountedCells === cells,
      byState,
      byTier,
      /** T4 is the only tier that means "recommendable with a full explanation". */
      recommendationReady: byTier.T4 ?? 0,
      explainable: (byTier.T4 ?? 0) + (byTier.T3 ?? 0),
      gatedVenues: byTier.T0 ?? 0,
      gatedHoldingUsableFacts: gatedHoldingUsableFacts.length,
      discardedUsableFacts: gatedHoldingUsableFacts.reduce((a, v) => a + v.usableFacts, 0),
      expectedVenues: expected.venues ?? null,
      unexplainedVenues: expected.venues == null ? null : expected.venues - venues.length,
      reconciles: expected.venues == null ? null : expected.venues === venues.length,
      today,
    },
    byField,
    gatedHoldingUsableFacts,
  };
}

/**
 * Read the value the read model currently carries for a claim-backed field.
 *
 * Kept beside the inventory rather than in the CLI so the live path and the offline fixture cannot
 * disagree about what "the metadata has a value" means -- the failure mode P0-B3 hit when the same
 * field name meant two different denominators in its two modes.
 */
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

/** Values that mean "nothing recorded" wherever a read-model field is inspected. */
function metadataHasValue(raw) {
  if (raw == null) return false;
  if (typeof raw === 'string') return !EMPTY_CLAIM_VALUES.has(raw.trim().toLowerCase());
  return true;
}

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
    // Location, and the one derived field, both need only coordinates.
    case 'location':
    case 'nearby_restaurants':
      return place.lat != null && place.lng != null;
    default: return false;
  }
}

/**
 * Turn raw table rows into the shape `auditCatalogue` consumes.
 *
 * The venue set is `venue_family_metadata`, because that is the catalogue the app serves from; a
 * place record with no metadata row would not be recommendable at all and is reported separately
 * rather than silently included.
 */
function buildVenueRows({ places = [], metadata = [], claims = [], pendingDrafts = [] }, today = new Date().toISOString().slice(0, 10)) {
  const placeById = new Map(places.map((p) => [p.familypilot_place_id, p]));
  const draftVenues = new Set(pendingDrafts.map((d) => d.familypilot_place_id));

  const claimsByVenueField = new Map();
  for (const row of claims) {
    const key = `${row.familypilot_place_id}~${row.field_key}`;
    if (!claimsByVenueField.has(key)) claimsByVenueField.set(key, []);
    claimsByVenueField.get(key).push({
      status: row.status,
      approvedBy: row.approved_by,
      validUntil: row.valid_until,
      value: row.value_json,
      fieldKey: row.field_key,
    });
  }

  return metadata.map((m) => {
    const place = placeById.get(m.familypilot_place_id);
    const hasDraft = draftVenues.has(m.familypilot_place_id);
    const fieldStates = {};

    for (const field of FIELD_INVENTORY) {
      if (field.origin !== 'claim') {
        fieldStates[field.key] = providerFieldPresent(field.key, place) ? 'confirmed_fresh' : 'unknown';
        continue;
      }
      // A dotted claim key also matches its own children, mirroring the SQL scan's prefix match.
      const own = claimsByVenueField.get(`${m.familypilot_place_id}~${field.claimKey}`) ?? [];
      const nested = [...claimsByVenueField.entries()]
        .filter(([key]) => key.startsWith(`${m.familypilot_place_id}~${field.claimKey}.`))
        .flatMap(([, rows]) => rows);
      fieldStates[field.key] = classifyFieldState(
        {
          claims: [...own, ...nested],
          hasDraft,
          metadataHasValue: metadataHasValue(METADATA_READERS[field.key]?.(m)),
        },
        today,
      );
    }

    return {
      familypilotPlaceId: m.familypilot_place_id,
      enrichmentStatus: m.enrichment_status ?? 'provider_only',
      fieldStates,
    };
  });
}

module.exports = {
  FIELD_INVENTORY,
  buildVenueRows,
  metadataHasValue,
  providerFieldPresent,
  CLAIM_FIELD_KEYS,
  FIELD_STATES,
  GATED_STATUSES,
  REFRESH_LEAD_DAYS,
  GRACE_DAYS,
  claimSaysSomething,
  claimIsTrustworthy,
  classifyFieldState,
  stateIsUsable,
  readinessTier,
  auditCatalogue,
};
