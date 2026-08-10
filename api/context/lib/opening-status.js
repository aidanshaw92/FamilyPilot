/**
 * Resolve consumer-facing opening status from provider facts.
 * Never infer open/closed without provider signal.
 */
function resolveOpeningStatus(isOpen) {
  if (isOpen === true) return 'open';
  if (isOpen === false) return 'closed';
  return 'unknown';
}

function isEligibleForRecommendation(openingStatus) {
  return openingStatus !== 'closed';
}

function openingStatusLabel(openingStatus) {
  switch (openingStatus) {
    case 'open':
      return 'Open now';
    case 'closed':
      return 'Closed now';
    default:
      return 'Opening status not confirmed';
  }
}

module.exports = {
  resolveOpeningStatus,
  isEligibleForRecommendation,
  openingStatusLabel,
};
