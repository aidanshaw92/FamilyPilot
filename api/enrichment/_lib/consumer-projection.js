/**
 * Consumer-safe metadata projection — only active trusted claims reach parents.
 * Internal enrichment APIs continue to use getMetadata() for the full editorial row.
 */

const { resolveEnrichmentStatus } = require('./validation');
const { getMetadata, rowToMetadata } = require('./enrichment-store');
const { getActiveClaims, projectActiveClaimsToPayload, metadataRowFromPayload } = require('./claims-store');

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
 * Build metadata safe for consumer places APIs.
 * Returns null when no active claims back family suitability (incl. ai_draft rows).
 */
async function getConsumerMetadata(familypilotPlaceId) {
  const raw = await getMetadata(familypilotPlaceId);
  const internalStatus = raw?.enrichmentStatus ?? 'provider_only';

  if (internalStatus === 'ai_draft') return null;

  const activeClaims = await getActiveClaims(familypilotPlaceId);
  if (activeClaims.length === 0) return null;

  const projected = projectActiveClaimsToPayload(activeClaims);
  const payload = attachTrustFields({ ...projected }, raw);
  const status = resolveEnrichmentStatus(payload, raw);
  const row = metadataRowFromPayload(familypilotPlaceId, payload, raw ?? { enrichmentStatus: status });
  row.enrichment_status = status === 'verified' ? 'verified' : 'enriched';
  return rowToMetadata(row);
}

module.exports = {
  getConsumerMetadata,
  attachTrustFields,
  CONSUMER_TRUST_FIELDS,
};
