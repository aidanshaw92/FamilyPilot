/**
 * Consumer-safe metadata projection — only active trusted claims reach parents.
 * Internal enrichment APIs continue to use getMetadata() for the full editorial row.
 */

const { resolveEnrichmentStatus } = require('./validation');
const { getMetadata, rowToMetadata } = require('./enrichment-store');
const {
  getActiveClaims,
  listClaimsWithFreshness,
  projectActiveClaimsToPayload,
  metadataRowFromPayload,
} = require('./claims-store');
const { toStaleFact } = require('./claim-freshness');

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
  return rowToMetadata(row);
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
  getVenueStaleFacts,
  attachTrustFields,
  CONSUMER_TRUST_FIELDS,
};
