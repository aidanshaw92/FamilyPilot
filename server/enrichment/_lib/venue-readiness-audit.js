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
 *
 * 4. WHAT THE CONSUMER SERVES IS NOT THE SAME AS WHAT IS ESTABLISHED. Production contains active
 *    claims whose source page describes a DIFFERENT venue -- Tate Britain and Tate Modern both carry
 *    facilities claims sourced from the Tate Liverpool page, and the South Kensington V&A carries
 *    one sourced from the Wedgwood Collection in Stoke-on-Trent. So a claim being served says
 *    nothing about whether its evidence belongs to that venue. Coverage is therefore reported twice:
 *    once as consumer-served, and once restricted to claims whose source-to-venue affinity this
 *    audit can establish. `sourceAffinity` is a SUSPICION signal for a dedicated repair workstream,
 *    never a verdict this audit acts on: shared campus pages, aliases and duplicate place records
 *    are legitimate, and the heuristic's own misses and false confirms are documented in the report.
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

  /**
   * `draft` describes where a candidate lives in `VenueEnrichmentDraftJson`, whose shape is NOT the
   * metadata payload's. Tri-state facts are objects carrying `.value`, duration is a bare number at
   * `suggestedVisitDuration`, and ages live under `recommendedAge.min/max`. An earlier revision
   * pointed at the metadata field names and passed whole objects to `carriesInformation`, so a draft
   * field of `{ value: 'unknown', confidence: 'low' }` would have stringified as informative and
   * become a false candidate. `draft: null` means the schema has no slot for this fact, so it can
   * never be a candidate -- which is itself a finding for four of the fifteen fields.
   */
  { key: 'toilets',               origin: 'claim', claimKey: 'familyFacilities.toilets',            draft: { path: ['familyFacilities', 'toilets'], kind: 'triState' },       group: 'facilities' },
  { key: 'baby_changing',         origin: 'claim', claimKey: 'familyFacilities.babyChanging',       draft: { path: ['familyFacilities', 'babyChanging'], kind: 'triState' },  group: 'facilities' },
  { key: 'accessible_toilet',     origin: 'claim', claimKey: 'accessibility.accessibleToilet',      draft: { path: ['accessibility', 'accessibleToilet'], kind: 'triState' }, group: 'accessibility' },
  { key: 'wheelchair_access',     origin: 'claim', claimKey: 'accessibility.wheelchairAccessible',  draft: { path: ['accessibility', 'wheelchairAccessible'], kind: 'triState' }, group: 'accessibility' },
  { key: 'pushchair_suitability', origin: 'claim', claimKey: 'pushchairSuitability',                draft: { path: ['pushchairSuitability'], kind: 'triState' },              group: 'accessibility' },
  { key: 'parking',               origin: 'claim', claimKey: 'familyFacilities.parking',            draft: { path: ['familyFacilities', 'parking'], kind: 'triState' },       group: 'logistics' },
  // The draft schema has no freeParking or playground slot, so neither can ever be a candidate.
  { key: 'free_parking',          origin: 'claim', claimKey: 'familyFacilities.freeParking',        draft: null,                                                             group: 'logistics' },
  { key: 'cafe_on_site',          origin: 'claim', claimKey: 'familyFacilities.cafe',              draft: { path: ['familyFacilities', 'cafe'], kind: 'triState' },          group: 'facilities' },
  { key: 'playground',            origin: 'claim', claimKey: 'familyFacilities.playground',        draft: null,                                                             group: 'facilities' },
  { key: 'sensory_sessions',      origin: 'claim', claimKey: 'sendInfo.sensoryFriendlySessions',   draft: { path: ['sendInfo', 'sensoryFriendlySessions'], kind: 'triState' }, group: 'accessibility' },
  { key: 'environment',           origin: 'claim', claimKey: 'environment',                        draft: { path: ['environment'], kind: 'triState' },                      group: 'day_shape' },
  { key: 'energy_level',          origin: 'claim', claimKey: 'energyLevel',                        draft: { path: ['energyLevel'], kind: 'triState' },                      group: 'day_shape' },
  { key: 'visit_duration',        origin: 'claim', claimKey: 'visitDurationMinutes',               draft: { path: ['suggestedVisitDuration'], kind: 'scalar' },              group: 'planning' },
  { key: 'recommended_ages',      origin: 'claim', claimKey: 'minRecommendedAge',                  draft: { path: ['recommendedAge'], kind: 'ageRange' },                    group: 'age' },
  // Age policy is written only by the B2 claim writer; the draft schema cannot express it.
  { key: 'hard_age_restriction',  origin: 'claim', claimKey: 'agePolicy',                          draft: null,                                                             group: 'age' },

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
/**
 * How well a claim's source page can be tied to the venue it is attached to.
 *
 * Deterministic and structural, derived from the venue's own provider URL rather than page content,
 * so it can be recomputed. Every class is a question, not an answer:
 *
 *   `confirmed`      the source path carries this venue's own discriminating slug
 *   `contested`      it carries a different catalogue venue's slug, or is a sibling of this venue's
 *                    own page under the same parent directory (the Tate Liverpool pattern)
 *   `unestablished`  a site-wide, index or filtered page that names no venue either way
 *
 * `confirmed` is not proof: `vam.ac.uk/east/museum/visit` confirms against V&A East Storehouse by
 * slug while describing a different building on the same campus. `unestablished` is not innocence:
 * it still holds the V&A/Wedgwood misattributions. Both limits are stated in the report.
 */
const SOURCE_AFFINITY = ['confirmed', 'contested', 'unestablished'];

/** Path segments too generic to identify a venue. */
const GENERIC_SLUGS = new Set(['visit', 'index', 'home', 'museum', 'about', 'london', 'en', 'park']);

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
  // `today` is passed through to the canonical predicate so a dated snapshot replays identically.
  const usable = claims.filter((c) => isClaimActive(c, today) && carriesInformation(c.value));

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

/** The last meaningful path segment of a URL, lowercased: a venue's discriminating slug. */
function urlLeaf(url) {
  if (!url) return null;
  const path = String(url).split('?')[0].replace(/^https?:\/\/[^/]+/, '').replace(/\/+$/, '');
  const leaf = path.split('/').filter(Boolean).pop();
  if (!leaf) return null;
  const lower = leaf.toLowerCase();
  return lower.length >= 5 && !GENERIC_SLUGS.has(lower) ? lower : null;
}

function urlHost(url) {
  if (!url) return null;
  const match = String(url).match(/^https?:\/\/(?:www\.)?([^/]+)/);
  return match ? match[1].toLowerCase() : null;
}

function urlPath(url) {
  if (!url) return '';
  return String(url).split('?')[0].replace(/^https?:\/\/[^/]+/, '').replace(/\/+$/, '').toLowerCase();
}

/**
 * Classify one claim's source-to-venue affinity.
 *
 * `otherVenueSlugs` maps a host to the slugs of OTHER catalogue venues on it, which is what makes a
 * cross-venue attribution detectable at all.
 */
function classifySourceAffinity({ sourceUrl, ownWebsite }, otherVenueSlugs = new Map()) {
  if (!sourceUrl) return 'unestablished';
  const ownLeaf = urlLeaf(ownWebsite);
  const srcPath = urlPath(sourceUrl);
  const srcHost = urlHost(sourceUrl);

  if (ownLeaf && srcPath.includes(ownLeaf)) return 'confirmed';

  /**
   * No `slug !== ownLeaf` guard here on purpose: the branch above has already returned `confirmed`
   * for every path containing this venue's own leaf, so such a guard would be unreachable. A
   * mutation pass proved it dead before it was removed.
   */
  const others = otherVenueSlugs.get(srcHost) ?? [];
  if (others.some((slug) => srcPath.includes(slug))) return 'contested';

  // Sibling page: same host, directly under the venue's own parent directory, different leaf.
  const ownPath = urlPath(ownWebsite);
  const ownParent = ownPath.replace(/\/[^/]*$/, '');
  if (srcHost && srcHost === urlHost(ownWebsite) && ownParent && srcPath.startsWith(`${ownParent}/`)) {
    return 'contested';
  }

  return 'unestablished';
}

function claimStateIsUsable(state) {
  return state === 'confirmed_fresh' || state === 'confirmed_refresh_due';
}

/**
 * Recommendation readiness, in tiers rather than one percentage.
 *
 * Cumulative, and each tier names what FamilyPilot can actually SAY.
 *
 * T4 is a STRICT PRODUCT TARGET -- full Venue Intelligence readiness -- not the planner's technical
 * minimum. The planner takes dwell minutes from the request, treats recommended ages as advice under
 * P0-B1 rather than a gate, and only requires pushchair suitability when the family actually needs
 * one. So zero venues at T4 means no venue yet has the complete picture the product wants to show a
 * parent without them typing anything; it does NOT mean the planner cannot schedule a venue today.
 * Whether a plan is executable is a question about one family's request, not a property of a venue.
 *
 * `identitySafeOnly` re-runs exactly the same tier logic over only the facts whose source this audit
 * can tie to this venue. It is a separate reading of the SAME rows, never a replacement: the
 * consumer serves the contested facts today, so the report has to state both figures side by side
 * rather than quietly adopting the stricter one and calling the problem measured.
 */
function readinessTier(venue, { identitySafeOnly = false } = {}) {
  const usable = new Set(CLAIM_FIELD_KEYS.filter(
    (key) => claimStateIsUsable(venue.fieldStates?.[key] ?? 'unknown')
      && (!identitySafeOnly || (venue.affinityByField?.[key] ?? 'unestablished') === 'confirmed'),
  ));
  const has = (field) => usable.has(field);
  const facilityCount = ['toilets', 'baby_changing', 'parking', 'free_parking'].filter(has).length;

  if (!consumerServesFacts(venue)) {
    const why = venue.enrichmentStatus === CONSUMER_BLOCKED_STATUS
      ? 'ai_draft: the consumer projection returns nothing at all'
      : 'no active claims, so the consumer projection returns nothing to serve';
    return { tier: 'T0', label: 'consumer serves no family facts', reason: why, usableFacts: usable.size };
  }
  if (usable.size === 0) {
    return {
      tier: 'T1',
      label: 'identity only: servable, zero usable facts',
      reason: identitySafeOnly
        ? 'facts may be served, but none has a source this audit can tie to this venue'
        : 'active claims exist but none carry information',
      usableFacts: 0,
    };
  }
  if (facilityCount >= 1 && has('environment') && has('pushchair_suitability') && has('visit_duration') && has('recommended_ages')) {
    return {
      tier: 'T4',
      label: 'full Venue Intelligence readiness',
      reason: 'facility, environment, pushchair, duration and ages all usable -- the complete picture, not the planner minimum',
      usableFacts: usable.size,
    };
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

  const affinityTotals = Object.fromEntries(SOURCE_AFFINITY.map((a) => [a, 0]));
  const servedAffinityTotals = Object.fromEntries(SOURCE_AFFINITY.map((a) => [a, 0]));
  const byTierIdentitySafe = {};

  for (const field of FIELD_INVENTORY) {
    const states = field.origin === 'claim' ? CLAIM_STATES : field.origin === 'provider' ? PROVIDER_STATES : DERIVED_STATES;
    byField[field.key] = {
      origin: field.origin,
      ...Object.fromEntries(states.map((s) => [s, 0])),
      usable: 0,
      servable: 0,
      // Of the usable ones, how many have an established source-to-venue affinity.
      identitySafe: 0,
      contested: 0,
      // Served AND identity-safe: the only cells a parent sees that this audit can also vouch for.
      servableIdentitySafe: 0,
    };
  }

  for (const venue of venues) {
    const serves = consumerServesFacts(venue);
    const tier = readinessTier(venue).tier;
    const strictTier = readinessTier(venue, { identitySafeOnly: true }).tier;
    byTier[tier] = (byTier[tier] ?? 0) + 1;
    byTierIdentitySafe[strictTier] = (byTierIdentitySafe[strictTier] ?? 0) + 1;

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

          const affinity = venue.affinityByField?.[field.key] ?? 'unestablished';
          affinityTotals[affinity] += 1;
          if (serves) servedAffinityTotals[affinity] += 1;
          if (affinity === 'confirmed') byField[field.key].identitySafe += 1;
          if (affinity === 'contested') byField[field.key].contested += 1;
          if (serves && affinity === 'confirmed') byField[field.key].servableIdentitySafe += 1;
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
      /**
       * The two coverage figures the report must never merge: what the consumer serves, and what
       * this audit can tie to the right venue. Their gap is the source-integrity problem.
       */
      sourceAffinityTotals: affinityTotals,
      servedSourceAffinityTotals: servedAffinityTotals,
      usableFacts: Object.values(affinityTotals).reduce((a, b) => a + b, 0),
      /** What a parent is shown today, contested sources included. */
      servedFacts: Object.values(servedAffinityTotals).reduce((a, b) => a + b, 0),
      identitySafeFacts: affinityTotals.confirmed,
      /** Served AND source-identity-safe. The honest coverage number. */
      servedIdentitySafeFacts: servedAffinityTotals.confirmed,
      contestedFacts: affinityTotals.contested,
      byTierIdentitySafe,
      recommendationReadyIdentitySafe: byTierIdentitySafe.T4 ?? 0,
      explainableIdentitySafe: (byTierIdentitySafe.T4 ?? 0) + (byTierIdentitySafe.T3 ?? 0),
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

/**
 * Whether a draft asserts a usable candidate for one specific field, per the real draft schema.
 *
 * Three shapes, because the schema has three: a tri-state object read through `.value`, a bare
 * scalar, and the `recommendedAge` range where either bound counts. Anything valued `unknown` is
 * not a candidate -- the generator ran and had nothing to say.
 */
function draftAssertsField(draftJson, field) {
  if (!draftJson || !field.draft) return false;
  let node = draftJson;
  for (const step of field.draft.path) {
    if (node == null || typeof node !== 'object') return false;
    node = node[step];
  }
  if (node == null) return false;

  switch (field.draft.kind) {
    case 'triState':
      // The object itself is always "informative" as JSON; only its `.value` decides.
      return typeof node === 'object' ? carriesInformation(node.value) : carriesInformation(node);
    case 'ageRange':
      return typeof node === 'object' && (Number.isFinite(node.min) || Number.isFinite(node.max));
    case 'scalar':
      return Number.isFinite(node) || (typeof node === 'string' && carriesInformation(node));
    default:
      return false;
  }
}

/**
 * host -> the discriminating slugs of every catalogue venue on it.
 *
 * This is what makes a cross-venue attribution detectable: without knowing that `young` and
 * `south-kensington` are both V&A venues, a claim sourced from one and attached to the other looks
 * like any other deep page on the same site.
 */
function otherVenueSlugsByHost(places = []) {
  const byHost = new Map();
  for (const place of places) {
    const host = urlHost(place.website);
    const leaf = urlLeaf(place.website);
    if (!host || !leaf) continue;
    if (!byHost.has(host)) byHost.set(host, new Set());
    byHost.get(host).add(leaf);
  }
  return new Map([...byHost].map(([host, slugs]) => [host, [...slugs]]));
}

/**
 * The offline corpus: a checksummed projection of the four production tables this audit reads.
 *
 * Production is unreachable from the sandbox this audit is developed in, so the corpus is
 * hand-transferred through a chat context in md5-verified chunks. That transport is why the decoder
 * below checks every width and every enum rather than tolerating a short line: a truncated
 * `string_agg` response once silently dropped eight rows and made a 165-row corpus look complete
 * when production held 173.
 *
 * It is a PROJECTION, not a copy. Every input the audit actually reads is carried exactly -- each
 * claim's status, approver, dates, source URL, and whether its value carries information; each
 * venue's website, enrichment status, and which provider and metadata fields hold a value; each
 * pending draft's JSON in full. What the audit never reads -- a claim's literal value text, a
 * venue's name and coordinates beyond their presence -- is replaced by a stand-in that lands on the
 * same side of every predicate. So `carriesInformation`, `isClaimActive`, `classifyClaimField`,
 * `classifySourceAffinity`, `draftAssertsField` and `providerFieldPresent` all run for real against
 * real inputs; nothing is pre-classified on the way in. The SQL that produced the corpus decides
 * only the booleans, and the report reconciles the result against separately written SQL
 * aggregates, so a mistake in either implementation shows up as a mismatch rather than a number.
 */
const CLAIM_STATUS_CODES = { a: 'active', d: 'disputed', s: 'superseded' };
const APPROVER_CODES = { A: 'source_evidence_auto_v2', E: 'enrichment-editor' };

/**
 * Stand-ins, one per metadata field shape, chosen so `carriesInformation` and the draft readers
 * return exactly what they returned on the real row.
 */
const METADATA_STAND_INS = {
  toilets: ['family_facilities', 'toilets', 'yes'],
  baby_changing: ['family_facilities', 'babyChanging', 'yes'],
  accessible_toilet: ['accessibility', 'accessibleToilet', 'yes'],
  wheelchair_access: ['accessibility', 'wheelchairAccessible', 'yes'],
  pushchair_suitability: [null, 'pushchair_suitability', 'good'],
  parking: ['family_facilities', 'parking', 'yes'],
  free_parking: ['family_facilities', 'freeParking', 'yes'],
  cafe_on_site: ['family_facilities', 'cafe', 'yes'],
  playground: ['family_facilities', 'playground', 'yes'],
  sensory_sessions: ['send_info', 'sensoryFriendlySessions', 'yes'],
  environment: [null, 'environment', 'indoor'],
  energy_level: [null, 'energy_level', 'moderate'],
  visit_duration: [null, 'visit_duration_minutes', 90],
  recommended_ages: [null, 'min_recommended_age', 3],
  hard_age_restriction: [null, 'venue_age_policy', { minMonthsInclusive: 48 }],
};

function splitCorpusLine(line, lineNumber, expectedColumns, what) {
  const parts = String(line).split('|');
  if (parts.length !== expectedColumns) {
    throw new Error(`${what} line ${lineNumber}: expected ${expectedColumns} columns, got ${parts.length}`);
  }
  if (!parts[0]) throw new Error(`${what} line ${lineNumber}: empty venue id`);
  return parts;
}

function requireFlags(flags, width, lineNumber, what) {
  if (flags.length !== width) {
    throw new Error(`${what} line ${lineNumber}: expected ${width} flags, got ${flags.length}`);
  }
  if (!/^[01]+$/.test(flags)) {
    throw new Error(`${what} line ${lineNumber}: flags ${JSON.stringify(flags)} are not 0/1`);
  }
  return [...flags].map((f) => f === '1');
}

/** `vid|website|<name,location,category,photos,openingHours>` */
function decodePlaceLine(line, lineNumber = 1) {
  const [vid, website, flags] = splitCorpusLine(line, lineNumber, 3, 'places');
  const [hasName, hasLocation, hasCategory, hasPhotos, hasHours] = requireFlags(flags, 5, lineNumber, 'places');
  return {
    familypilot_place_id: vid,
    // The website is carried verbatim: source-to-venue affinity is computed from it.
    website: website || null,
    name: hasName ? 'present' : '',
    lat: hasLocation ? 51.5 : null,
    lng: hasLocation ? -0.12 : null,
    category: hasCategory ? 'present' : '',
    photos: hasPhotos ? ['present'] : [],
    opening_hours: hasHours ? { monday: 'present' } : null,
  };
}

/** `vid|enrichment_status|<one flag per claim-backed field, FIELD_INVENTORY order>` */
function decodeMetadataLine(line, lineNumber = 1) {
  const [vid, status, flags] = splitCorpusLine(line, lineNumber, 3, 'metadata');
  const held = requireFlags(flags, CLAIM_FIELDS.length, lineNumber, 'metadata');
  const row = { familypilot_place_id: vid, enrichment_status: status };
  CLAIM_FIELDS.forEach((field, index) => {
    if (!held[index]) return;
    const standIn = METADATA_STAND_INS[field.key];
    if (!standIn) throw new Error(`metadata line ${lineNumber}: no stand-in defined for ${field.key}`);
    const [container, key, value] = standIn;
    if (container) {
      row[container] = { ...(row[container] ?? {}), [key]: value };
    } else {
      row[key] = value;
    }
  });
  return row;
}

/** `vid|field_key|status|approver|valid_until|checked_at|carriesInformation|source_url` */
function decodeClaimLine(line, lineNumber = 1) {
  const [vid, fieldKey, st, ab, validUntil, checkedAt, inf, sourceUrl] =
    splitCorpusLine(line, lineNumber, 8, 'claims');
  if (!CLAIM_STATUS_CODES[st]) throw new Error(`claims line ${lineNumber}: unknown status code ${JSON.stringify(st)}`);
  if (!APPROVER_CODES[ab]) throw new Error(`claims line ${lineNumber}: unknown approver code ${JSON.stringify(ab)}`);
  for (const [label, date] of [['valid_until', validUntil], ['checked_at', checkedAt]]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error(`claims line ${lineNumber}: ${label} ${JSON.stringify(date)} is not an ISO date`);
    }
  }
  if (inf !== '0' && inf !== '1') {
    throw new Error(`claims line ${lineNumber}: carriesInformation flag ${JSON.stringify(inf)} is not 0/1`);
  }
  return {
    familypilot_place_id: vid,
    field_key: fieldKey,
    status: CLAIM_STATUS_CODES[st],
    approved_by: APPROVER_CODES[ab],
    valid_until: validUntil,
    checked_at: checkedAt,
    // 'yes'/'unknown' are the two sides of carriesInformation; the audit reads nothing else.
    value_json: inf === '1' ? 'yes' : 'unknown',
    source_url: sourceUrl || null,
  };
}

/** `vid|<draft_json>` -- the draft JSON is carried in full, so the real reader runs on it. */
function decodeDraftLine(line, lineNumber = 1) {
  const separator = String(line).indexOf('|');
  if (separator <= 0) throw new Error(`drafts line ${lineNumber}: expected vid|<json>`);
  const vid = line.slice(0, separator);
  let draftJson;
  try {
    draftJson = JSON.parse(line.slice(separator + 1));
  } catch (error) {
    throw new Error(`drafts line ${lineNumber}: draft_json is not JSON (${error.message})`);
  }
  return { familypilot_place_id: vid, status: 'pending_review', draft_json: draftJson };
}

function decodeCorpusFile(text, decode, what) {
  return String(text)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line, index) => decode(line, index + 1));
}

/**
 * Decode a whole corpus and cross-check it for referential integrity, because a partial transfer of
 * one file and a complete transfer of another would otherwise produce a confidently wrong report.
 */
function decodeCorpus({ places = '', metadata = '', claims = '', drafts = '' }) {
  const decoded = {
    places: decodeCorpusFile(places, decodePlaceLine, 'places'),
    metadata: decodeCorpusFile(metadata, decodeMetadataLine, 'metadata'),
    claims: decodeCorpusFile(claims, decodeClaimLine, 'claims'),
    pendingDrafts: decodeCorpusFile(drafts, decodeDraftLine, 'drafts'),
  };
  const placeIds = new Set(decoded.places.map((p) => p.familypilot_place_id));
  for (const [what, rows] of [['metadata', decoded.metadata], ['claims', decoded.claims], ['drafts', decoded.pendingDrafts]]) {
    const orphan = rows.find((row) => !placeIds.has(row.familypilot_place_id));
    if (orphan) throw new Error(`${what} references ${orphan.familypilot_place_id}, which is not in places`);
  }
  return decoded;
}

/** Turn raw table rows into the shape `auditCatalogue` consumes. */
function buildVenueRows({ places = [], metadata = [], claims = [], pendingDrafts = [] }, today = new Date().toISOString().slice(0, 10)) {
  const placeById = new Map(places.map((p) => [p.familypilot_place_id, p]));
  const draftById = new Map(pendingDrafts.map((d) => [d.familypilot_place_id, d.draft_json]));

  const slugsByHost = otherVenueSlugsByHost(places);

  const claimsByVenue = new Map();
  for (const row of claims) {
    const claim = {
      status: row.status,
      approvedBy: row.approved_by,
      validUntil: row.valid_until,
      checkedAt: row.checked_at,
      value: row.value_json,
      fieldKey: row.field_key,
      sourceUrl: row.source_url,
    };
    if (!claimsByVenue.has(row.familypilot_place_id)) claimsByVenue.set(row.familypilot_place_id, []);
    claimsByVenue.get(row.familypilot_place_id).push(claim);
  }

  return metadata.map((m) => {
    const place = placeById.get(m.familypilot_place_id);
    const draftJson = draftById.get(m.familypilot_place_id) ?? null;
    const venueClaims = claimsByVenue.get(m.familypilot_place_id) ?? [];
    // The same count `getConsumerMetadata` decides on: active, trusted, unexpired.
    const activeClaimCount = venueClaims.filter((c) => isClaimActive(c, today)).length;

    /**
     * Affinity per claim, so a field's own source can be judged. Deliberately computed here rather
     * than folded into the field state: a contested claim is still SERVED today, and the report has
     * to be able to say both things at once.
     */
    const affinityByField = {};
    for (const field of CLAIM_FIELDS) {
      const forField = venueClaims.filter(
        (c) => isClaimActive(c, today) && carriesInformation(c.value)
          && (c.fieldKey === field.claimKey || String(c.fieldKey).startsWith(`${field.claimKey}.`)),
      );
      if (forField.length === 0) continue;
      const verdicts = forField.map((c) =>
        classifySourceAffinity({ sourceUrl: c.sourceUrl, ownWebsite: place?.website }, slugsByHost));
      // Worst verdict wins: one contested source taints the field until a human resolves it.
      affinityByField[field.key] = verdicts.includes('contested') ? 'contested'
        : verdicts.includes('unestablished') ? 'unestablished' : 'confirmed';
    }

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
      affinityByField,
    };
  });
}

module.exports = {
  FIELD_INVENTORY,
  SOURCE_AFFINITY,
  decodeCorpus,
  decodePlaceLine,
  decodeMetadataLine,
  decodeClaimLine,
  decodeDraftLine,
  classifySourceAffinity,
  otherVenueSlugsByHost,
  urlLeaf,
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
