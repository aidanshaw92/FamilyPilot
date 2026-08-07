export type MatchClassification =
  | 'Excellent match'
  | 'Great match'
  | 'Good match'
  | 'Worth considering'
  | 'Limited match';

export function getMatchClassification(score: number): MatchClassification {
  if (score >= 90) return 'Excellent match';
  if (score >= 80) return 'Great match';
  if (score >= 70) return 'Good match';
  if (score >= 60) return 'Worth considering';
  return 'Limited match';
}

export function getQualitativeRating(value: number): 'Excellent' | 'Good' | 'Fair' | 'Limited' {
  if (value >= 85) return 'Excellent';
  if (value >= 70) return 'Good';
  if (value >= 55) return 'Fair';
  return 'Limited';
}

export function formatTerrainLabel(terrain: string): string {
  switch (terrain) {
    case 'flat':
      return 'Mostly flat';
    case 'hilly':
      return 'Hilly in places';
    default:
      return 'Mixed terrain';
  }
}
