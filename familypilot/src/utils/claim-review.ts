import type { EvidenceBundle, EvidenceFact } from '@/src/types/ai-enrichment';

export interface EvidenceConflictSummary {
  field: string;
  label: string;
  claimFieldKey: string;
  conflicts: EvidenceFact[];
}

const FIELD_LABELS: Record<string, string> = {
  parking: 'Parking',
  freeParking: 'Free parking',
  toilets: 'Toilets',
  babyChanging: 'Baby changing',
  cafe: 'Café',
  pushchairSuitability: 'Pushchair suitability',
  environment: 'Environment',
  energyLevel: 'Energy level',
  terrain: 'Terrain',
};

const DRAFT_LABEL_TO_EVIDENCE_FIELD: Record<string, string> = {
  Parking: 'parking',
  'Free parking': 'freeParking',
  Toilets: 'toilets',
  'Baby changing': 'babyChanging',
  Café: 'cafe',
  'Pushchair suitability': 'pushchairSuitability',
  Environment: 'environment',
  'Energy level': 'energyLevel',
};

export function listEvidenceConflicts(bundle: EvidenceBundle | null | undefined): EvidenceConflictSummary[] {
  if (!bundle?.facts?.length) return [];
  return bundle.facts
    .filter(
      (fact): fact is EvidenceFact & { conflicts: EvidenceFact[] } =>
        fact.evidenceStatus === 'conflict' && Array.isArray(fact.conflicts) && fact.conflicts.length > 0,
    )
    .map((fact) => ({
      field: fact.field,
      label: FIELD_LABELS[fact.field] ?? fact.field,
      claimFieldKey: fact.field.startsWith('familyFacilities.')
        ? fact.field
        : fact.field.includes('.')
          ? fact.field
          : fact.field === 'terrain'
            ? 'extendedTerrain'
            : fact.field.startsWith('familyFacilities.')
              ? fact.field
              : ['parking', 'freeParking', 'toilets', 'babyChanging', 'cafe'].includes(fact.field)
                ? `familyFacilities.${fact.field}`
                : fact.field,
      conflicts: fact.conflicts,
    }));
}

export function conflictForDraftLabel(
  label: string,
  conflicts: EvidenceConflictSummary[],
): EvidenceConflictSummary | undefined {
  const evidenceField = DRAFT_LABEL_TO_EVIDENCE_FIELD[label];
  if (!evidenceField) return undefined;
  return conflicts.find((c) => c.field === evidenceField);
}

export function hasUnresolvedEvidenceConflicts(bundle: EvidenceBundle | null | undefined): boolean {
  return listEvidenceConflicts(bundle).length > 0;
}

export function formatClaimFieldKey(fieldKey: string): string {
  if (fieldKey.startsWith('familyFacilities.')) {
    const sub = fieldKey.slice('familyFacilities.'.length);
    return FIELD_LABELS[sub] ?? sub.replace(/([A-Z])/g, ' $1');
  }
  if (fieldKey.startsWith('accessibility.')) {
    return fieldKey.slice('accessibility.'.length).replace(/([A-Z])/g, ' $1');
  }
  return FIELD_LABELS[fieldKey] ?? fieldKey.replace(/([A-Z])/g, ' $1');
}

export function formatClaimValue(value: unknown): string {
  if (value === null || value === undefined) return 'unknown';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
