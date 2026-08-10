/**
 * Helpers for enrichment review — evidence conflicts and field labelling.
 * Drafts may carry conflict metadata; only human-approved fields become claims.
 */

const FIELD_LABELS = {
  parking: 'Parking',
  freeParking: 'Free parking',
  toilets: 'Toilets',
  babyChanging: 'Baby changing',
  cafe: 'Café',
  pushchairSuitability: 'Pushchair suitability',
  environment: 'Environment',
  energyLevel: 'Energy level',
  terrain: 'Terrain',
  wheelchairAccessible: 'Wheelchair accessible',
  accessibleToilet: 'Accessible toilet',
  accessibleParking: 'Accessible parking',
  playground: 'Playground',
};

const EVIDENCE_TO_CLAIM_FIELD = {
  parking: 'familyFacilities.parking',
  freeParking: 'familyFacilities.freeParking',
  toilets: 'familyFacilities.toilets',
  babyChanging: 'familyFacilities.babyChanging',
  cafe: 'familyFacilities.cafe',
  pushchairSuitability: 'pushchairSuitability',
  environment: 'environment',
  energyLevel: 'energyLevel',
  terrain: 'extendedTerrain',
};

function labelForEvidenceField(field) {
  return FIELD_LABELS[field] ?? field.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

function claimFieldForEvidence(field) {
  return EVIDENCE_TO_CLAIM_FIELD[field] ?? field;
}

/**
 * @param {{ facts?: Array<{ field: string, evidenceStatus?: string, conflicts?: unknown[] }> } | null | undefined} evidenceBundle
 */
function listEvidenceConflicts(evidenceBundle) {
  if (!evidenceBundle?.facts?.length) return [];
  return evidenceBundle.facts
    .filter((fact) => fact.evidenceStatus === 'conflict' && Array.isArray(fact.conflicts) && fact.conflicts.length > 0)
    .map((fact) => ({
      field: fact.field,
      label: labelForEvidenceField(fact.field),
      claimFieldKey: claimFieldForEvidence(fact.field),
      conflicts: fact.conflicts,
    }));
}

function hasUnresolvedEvidenceConflicts(evidenceBundle) {
  return listEvidenceConflicts(evidenceBundle).length > 0;
}

module.exports = {
  FIELD_LABELS,
  EVIDENCE_TO_CLAIM_FIELD,
  labelForEvidenceField,
  claimFieldForEvidence,
  listEvidenceConflicts,
  hasUnresolvedEvidenceConflicts,
};
