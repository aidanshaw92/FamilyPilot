/**
 * Consumer-safe metadata projection — only active trusted claims reach parents.
 * Internal enrichment APIs continue to use getMetadata() for the full editorial row.
 */

const { resolveEnrichmentStatus } = require('./validation');
const { getMetadata, getMetadataBatch, rowToMetadata } = require('./enrichment-store');
const {
  getActiveClaims,
  getActiveClaimsBatch,
  listClaimsWithFreshness,
  projectActiveClaimsToPayload,
  metadataRowFromPayload,
} = require('./claims-store');
const { toStaleFact } = require('./claim-freshness');
const { PROJECTED_RULES } = require('./venue-rules');

const CONSUMER_TRUST_FIELDS = ['lastChecked', 'checkedBy', 'enrichmentProvenance'];

function attachTrustFields(projectedPayload, rawMetadata) {
  if (!rawMetadata) return projectedPayload;
  for (const key of CONSUMER_TRUST_FIELDS) {
    if (rawMetadata[key] !== undefined && rawMetadata[key] !== null) {
      projectedPayload[key] = rawMetadata[key];
    }
  }
  return projectedPayload;
}

/**
 * Which claims a venue's contradiction state has knocked out.
 *
 * A parent report that disagrees with a claim makes that field unknown until a later source check
 * resolves it. Shared by the trusted and stale paths so a contradicted fact cannot survive in one
 * while being suppressed in the other.
 */
async function disputedFieldKeys(familypilotPlaceId, claims) {
  const fields = await require('../../feedback/_lib/store').venueFeedback(familypilotPlaceId, claims);
  const definitions = require('../../feedback/_lib/rules').FIELDS;
  return new Set(
    Object.entries(fields)
      .filter(([, field]) => field.status === 'needs_recheck')
      .map(([key]) => definitions[key].claim),
  );
}

/** The consumer metadata with the venue's reviewed rules attached, read from the claim projection and nowhere else. */
function withRules(metadata, payload) {
  const rules = payload[PROJECTED_RULES];
  return rules && rules.length ? { ...metadata, rules } : metadata;
}

/**
 * Build metadata safe for consumer places APIs.
 * Returns null when no active claims back family suitability (incl. ai_draft rows).
 *
 * Built from trusted claims alone. A claim that has slipped past its lifetime never reaches this
 * payload, so a screen that knows nothing about freshness reads the field as absent and resolves
 * it to unknown — which is the safe default, and it gets there without having to cooperate.
 */
async function getConsumerMetadata(familypilotPlaceId) {
  const raw = await getMetadata(familypilotPlaceId);
  const internalStatus = raw?.enrichmentStatus ?? 'provider_only';

  if (internalStatus === 'ai_draft') return null;

  const activeClaims = await getActiveClaims(familypilotPlaceId);
  if (activeClaims.length === 0) return null;

  const disputed = await disputedFieldKeys(familypilotPlaceId, activeClaims);
  const projected = projectActiveClaimsToPayload(activeClaims.filter((c) => !disputed.has(c.fieldKey)));
  const payload = attachTrustFields({ ...projected }, raw);
  const status = resolveEnrichmentStatus(payload, raw);
  const row = metadataRowFromPayload(familypilotPlaceId, payload, raw ?? { enrichmentStatus: status });
  row.enrichment_status = status === 'verified' ? 'verified' : 'enriched';
  return withRules(rowToMetadata(row), payload);
}

/**
 * `getConsumerMetadata` for many venues: id -> exactly what `getConsumerMetadata(id)` returns, built from a handful of
 * set-based reads instead of three or four round trips per venue.
 *
 * The London search applies this overlay to every place it returns (about 160). Per venue it was a metadata read, a
 * claims read and a visit-reports read, chained, so one request made ~410 database round trips with up to 160 in
 * flight at once. The projection itself (which claims are trusted, which a parent report has disputed, the payload a
 * screen reads) is unchanged: the same pure functions run on the same rows, so nothing about the evidence changes.
 */
async function getConsumerMetadataBatch(familypilotPlaceIds) {
  const ids = [...new Set(familypilotPlaceIds)];
  const out = new Map(ids.map((id) => [id, null]));
  if (ids.length === 0) return out;
  const [rawById, claimsById] = await Promise.all([getMetadataBatch(ids), getActiveClaimsBatch(ids)]);

  const candidates = new Map();
  for (const id of ids) {
    const raw = rawById.get(id);
    if ((raw?.enrichmentStatus ?? 'provider_only') === 'ai_draft') continue;
    const activeClaims = claimsById.get(id) ?? [];
    if (activeClaims.length === 0) continue;
    candidates.set(id, activeClaims);
  }
  if (candidates.size === 0) return out;

  const { venueFeedbackBatch } = require('../../feedback/_lib/store');
  const definitions = require('../../feedback/_lib/rules').FIELDS;
  const feedbackById = await venueFeedbackBatch(candidates);
  for (const [id, activeClaims] of candidates) {
    const fields = feedbackById.get(id) ?? {};
    const disputed = new Set(
      Object.entries(fields)
        .filter(([, field]) => field.status === 'needs_recheck')
        .map(([key]) => definitions[key].claim),
    );
    const raw = rawById.get(id);
    const projected = projectActiveClaimsToPayload(activeClaims.filter((c) => !disputed.has(c.fieldKey)));
    const payload = attachTrustFields({ ...projected }, raw);
    const status = resolveEnrichmentStatus(payload, raw);
    const row = metadataRowFromPayload(id, payload, raw ?? { enrichmentStatus: status });
    row.enrichment_status = status === 'verified' ? 'verified' : 'enriched';
    out.set(id, withRules(rowToMetadata(row), payload));
  }
  return out;
}

/**
 * Facts we still hold but no longer vouch for, for display only.
 *
 * Deliberately a separate call returning a separate shape. Putting these anywhere inside the
 * metadata object — even behind a freshness tag — would place a stale value in the field a naive
 * renderer reads, and leave correctness depending on every screen remembering to check the tag.
 * A `StaleFact` carries no tri-state and no facility map, so there is nothing here for an existing
 * consumer to pick up by accident.
 *
 * A contradicted claim is excluded: grace keeps a fact alive through an outage, never through a
 * disagreement.
 */
async function getVenueStaleFacts(familypilotPlaceId) {
  const raw = await getMetadata(familypilotPlaceId);
  if ((raw?.enrichmentStatus ?? 'provider_only') === 'ai_draft') return [];

  const { trusted, stale } = await listClaimsWithFreshness(familypilotPlaceId);
  if (stale.length === 0) return [];

  const disputed = await disputedFieldKeys(familypilotPlaceId, [...trusted, ...stale]);
  return stale.filter((claim) => !disputed.has(claim.fieldKey)).map(toStaleFact);
}

module.exports = {
  getConsumerMetadata,
  getConsumerMetadataBatch,
  getVenueStaleFacts,
  attachTrustFields,
  CONSUMER_TRUST_FIELDS,
};
