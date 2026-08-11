/**
 * North-west London parent-testing pilot — hide deferred prototypes so Home,
 * Explore, Saved, and venue decisions stay the focus.
 *
 * Set EXPO_PUBLIC_SHOW_DEFERRED_FEATURES=true to reveal everything (internal QA).
 */

export type PilotFeature =
  | 'trips_tab'
  | 'plan_something_action'
  | 'holiday'
  | 'packing'
  | 'car_fit'
  | 'explore_restaurants'
  | 'eat_nearby'
  | 'saved_restaurants'
  | 'concierge';

const DEFERRED_PILOT_FEATURES = new Set<PilotFeature>([
  'trips_tab',
  'plan_something_action',
  'holiday',
  'packing',
  'car_fit',
  'explore_restaurants',
  'eat_nearby',
  'saved_restaurants',
  'concierge',
]);

function deferredFeaturesEnabled(): boolean {
  return process.env.EXPO_PUBLIC_SHOW_DEFERRED_FEATURES === 'true';
}

export function isPilotFeatureVisible(feature: PilotFeature): boolean {
  if (deferredFeaturesEnabled()) return true;
  return !DEFERRED_PILOT_FEATURES.has(feature);
}

export function visibleExploreCategoryIds(): string[] {
  const categories = ['all', 'parks', 'restaurants', 'farms', 'museums', 'activities'];
  return categories.filter(
    (id) => id !== 'restaurants' || isPilotFeatureVisible('explore_restaurants'),
  );
}

export function isPilotBuild(): boolean {
  return !deferredFeaturesEnabled();
}
