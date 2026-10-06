/**
 * What each required constraint is called when a parent reads about it.
 *
 * Only the fields the matcher can hold at `required` strength about a venue appear. A field with no entry is not shown as a
 * raw key; callers fall back to the sequencer's own sentence or say nothing.
 */
const LABELS: Record<string, string> = {
  // Namespaced exactly as the matcher emits them. A bare `toilets` here would silently never match.
  'familyFacilities.toilets': 'toilets',
  'familyFacilities.babyChanging': 'baby changing',
  'familyFacilities.parking': 'parking',
  pushchairSuitability: 'pushchair access',
};

export const mustHaveLabel = (field: string): string | null => LABELS[field] ?? null;
