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

/**
 * Each sentence is written once, with the place left as a slot: `here` / `this place` when the list is about one venue,
 * the stop's own name when a day has several and "here" would not say which.
 */
type Where = { at: string; of: string };
const UNKNOWN_FACT_SENTENCES: Record<string, (where: Where) => string> = {
  'familyFacilities.toilets': ({ at }) => `Toilets are not confirmed ${at}`,
  'familyFacilities.babyChanging': ({ at }) => `Baby changing is not confirmed ${at}`,
  'familyFacilities.parking': ({ at }) => `Parking is not confirmed ${at}`,
  pushchairSuitability: ({ at }) => `Pushchair access is not confirmed ${at}`,
  environment: ({ of }) => `Whether ${of} is indoors or outdoors is not confirmed`,
  energyLevel: ({ at }) => `How busy or lively it gets ${at} is not confirmed`,
  estimatedSpend: ({ at }) => `What a visit costs ${at} is not confirmed`,
  visitDurationMinutes: ({ at }) => `How long a visit usually takes ${at} is not confirmed`,
  // Advice rather than a gate, so this says what is missing and never implies anyone was excluded.
  ageRecommendedFit: ({ of }) => `Recommended ages are not published for ${of}`,
  ageAdmission: ({ at }) => `Any age policy at the door is not confirmed ${at}`,
  journey: ({ of }) => `The journey time to ${of} is not confirmed`,
  budget: ({ of }) => `Whether ${of} fits your budget is not confirmed`,
};

const HERE: Where = { at: 'here', of: 'this place' };

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

function describe(field: string, where: Where): string {
  const known = UNKNOWN_FACT_SENTENCES[field];
  if (known) return known(where);
  const words = humaniseKey(field);
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} is not confirmed${where === HERE ? '' : ` ${where.at}`}`;
}

/** An unconfirmed fact about the one place a list is about: "Toilets are not confirmed here". */
export function describeUnknownFact(field: string): string {
  return describe(field, HERE);
}

/** The same, naming the place, for a list that covers more than one stop: "Toilets are not confirmed at Café Rouge". */
export function describeUnknownFactAt(field: string, placeName: string): string {
  const name = placeName.trim();
  return name ? describe(field, { at: `at ${name}`, of: name }) : describe(field, HERE);
}
