/** Shared label for Family Match presentation across all variants. */
export const FAMILY_MATCH_LABEL = 'Family Match';

export function formatFamilyMatchLabel(score: number): string {
  return `${score}% ${FAMILY_MATCH_LABEL}`;
}
