import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { isInviteCode } from '@/src/services/planning/invite-links';

/**
 * An invitation link that was opened before the person had an account.
 *
 * Someone who follows a link has to create an account and describe their family before they can accept, which is
 * several screens and possibly an email round-trip. The code is held here, on this device only, so it is still there
 * afterwards and the accept screen can pick it up. It is the code and nothing else, and it is cleared the moment it is
 * accepted, declined or found to be invalid.
 */
interface PendingInviteState {
  code: string | null;
  hydrated: boolean;
  setCode: (code: string) => void;
  clear: () => void;
}

export const usePendingInviteStore = create<PendingInviteState>()(
  persist(
    (set) => ({
      code: null,
      hydrated: false,
      setCode: (code) => set({ code: isInviteCode(code) ? code : null }),
      clear: () => set({ code: null }),
    }),
    {
      name: 'familypilot-pending-invite-v1',
      // Expo Router prerenders every route in Node, where AsyncStorage's web build has no `window`: skip there.
      skipHydration: Platform.OS === 'web' && typeof window === 'undefined',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ code: state.code }),
      onRehydrateStorage: () => () => usePendingInviteStore.setState({ hydrated: true }),
    },
  ),
);
