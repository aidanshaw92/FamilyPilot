/**
 * What an unconfirmed fact is called when a parent reads it.
 *
 * The planner's constraint fields are internal keys -- `familyFacilities.babyChanging`,
 * `ageRecommendedFit` -- and both the day sequencer and the single-venue planner used to put them
 * straight into a list a parent sees. The Plan screen read "ageRecommendedFit: not confirmed" and
 * the Plans tab still does; a key is not a sentence, and a parent cannot act on one.
 *
 * One vocabulary, used wherever an unknown reaches a person, so the two paths cannot drift. Nothing
 * is ever dropped for being unrecognised: an unmapped key is turned into words rather than hidden,
 * because an unconfirmed fact a parent is not told about is the failure this whole list exists to
 * prevent.
 */

const UNKNOWN_FACT_SENTENCES: Record<string, string> = {
  'familyFacilities.toilets': 'Toilets are not confirmed here',
  'familyFacilities.babyChanging': 'Baby changing is not confirmed here',
  'familyFacilities.parking': 'Parking is not confirmed here',
  pushchairSuitability: 'Pushchair access is not confirmed here',
  environment: 'Whether this place is indoors or outdoors is not confirmed',
  energyLevel: 'How busy or lively it gets has not been reviewed',
  estimatedSpend: 'What a visit costs is not confirmed',
  visitDurationMinutes: 'How long a visit usually takes is not confirmed',
  // Advice rather than a gate, so this says what is missing and never implies anyone was excluded.
  ageRecommendedFit: 'Recommended ages are not published for this place',
  ageAdmission: 'Any age policy at the door is not confirmed',
  journey: 'The journey time is not confirmed',
  budget: 'Whether this fits your budget is not confirmed',
};

/** `familyFacilities.babyChanging` to `baby changing`, for a key nobody has written a sentence for. */
function humaniseKey(field: string): string {
  const leaf = field.split('.').pop() ?? field;
  const spaced = leaf
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return spaced || field;
}

export function describeUnknownFact(field: string): string {
  const known = UNKNOWN_FACT_SENTENCES[field];
  if (known) return known;
  const words = humaniseKey(field);
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} is not confirmed`;
}
