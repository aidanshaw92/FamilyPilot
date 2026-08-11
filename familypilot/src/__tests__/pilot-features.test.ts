import { describe, expect, it, vi } from 'vitest';

import {
  isPilotBuild,
  isPilotFeatureVisible,
  visibleExploreCategoryIds,
} from '@/src/config/pilot-features';

describe('pilot-features', () => {
  it('hides deferred prototype features in the default pilot build', () => {
    vi.stubEnv('EXPO_PUBLIC_SHOW_DEFERRED_FEATURES', '');
    expect(isPilotBuild()).toBe(true);
    expect(isPilotFeatureVisible('trips_tab')).toBe(false);
    expect(isPilotFeatureVisible('holiday')).toBe(false);
    expect(isPilotFeatureVisible('explore_restaurants')).toBe(false);
    expect(isPilotFeatureVisible('eat_nearby')).toBe(false);
  });

  it('reveals deferred features when explicitly enabled for internal QA', () => {
    vi.stubEnv('EXPO_PUBLIC_SHOW_DEFERRED_FEATURES', 'true');
    expect(isPilotBuild()).toBe(false);
    expect(isPilotFeatureVisible('trips_tab')).toBe(true);
    expect(isPilotFeatureVisible('car_fit')).toBe(true);
    expect(isPilotFeatureVisible('concierge')).toBe(true);
  });

  it('removes restaurants from explore categories in pilot mode', () => {
    vi.stubEnv('EXPO_PUBLIC_SHOW_DEFERRED_FEATURES', '');
    expect(visibleExploreCategoryIds()).not.toContain('restaurants');
    expect(visibleExploreCategoryIds()).toContain('parks');
  });

  it('includes restaurants in explore categories when deferred features are shown', () => {
    vi.stubEnv('EXPO_PUBLIC_SHOW_DEFERRED_FEATURES', 'true');
    expect(visibleExploreCategoryIds()).toContain('restaurants');
  });
});
