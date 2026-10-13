import { create } from 'zustand';

/**
 * Whether the floating tab bar is out of the way. Not persisted: it is true only while a screen shows a focused modal that
 * should have the whole screen (Meet halfway's Edit meeting details), and the screen that set it clears it when the modal
 * closes or the screen goes away, so the navigation is never left hidden.
 */
interface ChromeState {
  tabBarHidden: boolean;
  setTabBarHidden: (hidden: boolean) => void;
}

export const useChromeStore = create<ChromeState>((set) => ({
  tabBarHidden: false,
  setTabBarHidden: (tabBarHidden) => set({ tabBarHidden }),
}));
