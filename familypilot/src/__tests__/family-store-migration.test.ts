import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useFamilyStore } from '@/src/stores/family-store';

const KEY = 'familypilot-family-v1';

const legacyBlob = {
  state: {
    profile: {
      id: 'family-1', parentName: 'Aidan',
      members: [
        { id: 'p', name: 'Aidan', role: 'parent', dateOfBirth: '1990-01-01', age: 30 },
        { id: 'c1', name: 'Rosie', role: 'child', dateOfBirth: '2020-01-01', age: 6 },
      ],
      homeLocation: 'Bushey', budgetTier: 'moderate', maxDriveMinutes: 90, completionPercent: 50,
      routines: [], mustHaveFacilities: [],
    },
    hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 4,
  },
  version: 0,
};

afterEach(() => {
  vi.useRealTimers();
});

describe('the persisted family store, end to end through rehydration', () => {
  it('upgrades a version-0 profile and keeps the family’s data and onboarding state', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify(legacyBlob));
    await useFamilyStore.persist.rehydrate();
    const state = useFamilyStore.getState();
    expect(state.hasCompletedOnboarding).toBe(true);
    expect(state.profile.parentName).toBe('Aidan');
    const rosie = state.profile.members.find((m) => m.name === 'Rosie')!;
    expect(rosie).toMatchObject({ age: 6, dobKnown: false });
  });

  it('survives a corrupt blob without throwing and without losing the app’s ability to start', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ state: { profile: 'broken', hasCompletedOnboarding: 'yes' }, version: 0 }));
    await expect(useFamilyStore.persist.rehydrate()).resolves.not.toThrow();
    expect(Array.isArray(useFamilyStore.getState().profile.members)).toBe(true);
  });

  it('brings a trusted child’s age up to today on rehydrate, even at the current version', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 11, 12, 0, 0));
    await AsyncStorage.setItem(KEY, JSON.stringify({
      state: {
        profile: {
          ...legacyBlob.state.profile,
          members: [{ id: 'c1', name: 'Mia', role: 'child', dateOfBirth: '2022-06-10', dobKnown: true, age: 3, ageMonths: null }],
        },
        hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 4,
      },
      version: 1,
    }));
    await useFamilyStore.persist.rehydrate();
    // Stored as 3; she turned 4 yesterday.
    expect(useFamilyStore.getState().profile.members[0].age).toBe(4);
  });
});
