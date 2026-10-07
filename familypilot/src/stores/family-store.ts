import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { FamilyProfile } from '@/src/types';
import { withDerivedAges } from '@/src/utils/child-age';
import { createEmptyProfile, withCompletion } from '@/src/utils/profile-defaults';
import { withoutLegacyDefaults } from '@/src/utils/preferences';
import { migrateLegacyProfile } from '@/src/utils/profile-migration';

interface FamilyState {
  profile: FamilyProfile;
  hasCompletedOnboarding: boolean;
  hasSeenSplash: boolean;
  profileRevision: number;
  _hasHydrated: boolean;
  setProfile: (profile: FamilyProfile) => void;
  updateProfile: (updates: Partial<FamilyProfile>) => void;
  completeOnboarding: () => void;
  markSplashSeen: () => void;
  resetForTesting: () => void;
  setHasHydrated: (value: boolean) => void;
}

export const useFamilyStore = create<FamilyState>()(
  persist(
    (set) => ({
      profile: createEmptyProfile(),
      hasCompletedOnboarding: false,
      hasSeenSplash: false,
      profileRevision: 0,
      _hasHydrated: false,

      setProfile: (profile) =>
        set((state) => ({
          profile: withCompletion(profile),
          profileRevision: state.profileRevision + 1,
        })),

      updateProfile: (updates) =>
        set((state) => ({
          profile: withCompletion({ ...state.profile, ...updates }),
          profileRevision: state.profileRevision + 1,
        })),

      completeOnboarding: () => set({ hasCompletedOnboarding: true }),

      markSplashSeen: () => set({ hasSeenSplash: true }),

      resetForTesting: () =>
        set({
          profile: createEmptyProfile(),
          hasCompletedOnboarding: false,
          hasSeenSplash: false,
          profileRevision: 0,
        }),

      setHasHydrated: (value) => set({ _hasHydrated: value }),
    }),
    {
      name: 'familypilot-family-v1',
      // Version 1 is the first with a date of birth a parent actually entered and a per-child shape.
      // Version 2 stops treating an unchosen 30 minute journey limit and "moderate" budget as the family's own: every
      // profile used to be created with both, so a stored 30 / "moderate" cannot be told from an answer and is read as
      // "not set" (anything else was chosen and is kept). See utils/preferences.ts.
      // The storage KEY keeps its name on purpose: a new key would orphan every existing family.
      version: 2,
      migrate: (persisted, fromVersion) => {
        const state = (persisted ?? {}) as Partial<FamilyState>;
        const migrated = migrateLegacyProfile(state.profile).profile;
        const profile = fromVersion < 2 ? withCompletion(withoutLegacyDefaults(migrated)) : migrated;
        return { ...state, profile } as FamilyState;
      },
      // Every rehydrate, current version or not, brings each child's age up to today: a birthday that
      // passed while the app was closed must not wait for the next edit to show.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<FamilyState>;
        return {
          ...current,
          ...saved,
          profile: saved.profile ? withDerivedAges(saved.profile) : current.profile,
        };
      },
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        profile: state.profile,
        hasCompletedOnboarding: state.hasCompletedOnboarding,
        hasSeenSplash: state.hasSeenSplash,
        profileRevision: state.profileRevision,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
