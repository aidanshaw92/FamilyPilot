/**
 * Venue readiness, revised (2026-10-08). Three levels, judged on what a parent can rely on, not on how full a record is.
 *
 *   discoverable          the place can be found and shown; little or nothing else is established
 *   recommendation-ready  trustworthy, category-relevant information with honest limitations: enough to tell a family
 *                         whether to go, what it costs, how to get there and what children do there
 *   highly-personalised   recommendation-ready, plus enough age-specific activity evidence and practical detail to give
 *                         families of different ages different, specific reasons
 *
 * Rules that keep the levels honest:
 *   - ACTIVITY IS NOT LOGISTICS. They are separate requirements and neither stands in for the other.
 *   - AN OPTIONAL FACILITY NEVER EXCLUDES. A cafe, playground, pushchair note or accessibility detail that is unknown is
 *     listed as a limitation; it does not stop a venue being recommendation-ready.
 *   - ONLY ACCEPTED FACTS COUNT. A hypothesis or an unknown never counts. A fact waiting for a person counts only in the
 *     "if approved" view, so the level shown without a person is never inflated by an unreviewed claim.
 *   - "EXCELLENT" IS NOT A PREREQUISITE for either upper level.
 *
 * Pure: no I/O, no clock.
 */
const LEVELS = ['discoverable', 'recommendation-ready', 'highly-personalised'];
/** Months: under 3, 3 to 6, 7 to 17. A band is covered when an accepted activity's age range overlaps it. */
const AGE_BANDS = [[0, 36], [36, 84], [84, 216]];

const has = (facts, sec, keys) => facts.some((f) => f.sec === sec && (keys ? keys.includes(f.key) : true));

/**
 * @param facts   [{sec,key,status,kind?,minMonths?,maxMonthsExclusive?}]
 * @param view    'auto'     only facts accepted without a person
 *                'approved' also the facts a person has yet to decide, assuming each is approved
 * @param layerA  { hours: boolean } what the provider layer already supplies
 */
function readiness(facts, { view = 'auto', layerA = {} } = {}) {
  const accepted = facts.filter((f) => f.status === 'verified' || (view === 'approved' && f.status === 'review'));

  const requirements = {
    opening: has(accepted, 'opening', ['hours']) || Boolean(layerA.hours),
    // The cost of getting in must be established: free, or a stated price. A child concession or add-on price alone is not it.
    cost: has(accepted, 'pricing', ['free', 'variable', 'paid']),
    gettingThere: has(accepted, 'transport', ['station', 'bus', 'parking', 'entrances']),
    childActivity: accepted.some((f) => f.sec === 'activities' && f.kind === 'provision'),
    familyEssentials: has(accepted, 'toilets', ['toilets', 'babyChanging', 'accessibleToilet']),
  };
  const missing = Object.entries(requirements).filter(([, ok]) => !ok).map(([k]) => k);
  const recommendationReady = missing.length === 0;

  const aged = accepted.filter((f) => f.sec === 'activities' && f.maxMonthsExclusive != null);
  const bandsCovered = AGE_BANDS.filter(([lo, hi]) => aged.some((f) => f.minMonths < hi && f.maxMonthsExclusive > lo)).length;
  const groups = {
    pushchair: has(accepted, 'pushchair'),
    babyChanging: has(accepted, 'toilets', ['babyChanging']),
    food: has(accepted, 'food', ['cafe', 'picnic']),
    access: has(accepted, 'access'),
    play: has(accepted, 'play'),
    transport: has(accepted, 'transport'),
    childPrice: has(accepted, 'pricing', ['free', 'under3', 'under1', 'child']),
  };
  const practical = Object.values(groups).filter(Boolean).length;
  const personalisation = {
    ageBandsCovered: bandsCovered,
    anyAgedProvision: aged.some((f) => f.kind === 'provision'),
    practicalGroups: practical,
    childPrice: groups.childPrice,
  };
  const highlyPersonalised = recommendationReady && bandsCovered >= 2 && personalisation.anyAgedProvision && practical >= 4 && groups.childPrice;

  const level = highlyPersonalised ? 'highly-personalised' : recommendationReady ? 'recommendation-ready' : 'discoverable';
  const limitations = facts.filter((f) => f.status === 'unknown' || f.status === 'hypothesis').map((f) => `${f.sec}.${f.key}`);
  return { level, view, requirements, missing, personalisation, limitations };
}

module.exports = { LEVELS, AGE_BANDS, readiness };
