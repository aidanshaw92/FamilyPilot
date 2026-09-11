import { vi } from 'vitest';

// Zustand's `persist` middleware writes to AsyncStorage as a fire-and-forget
// side effect. The real native module expects a `window`/DOM-like host and
// throws "window is not defined" under the `node` test environment, which
// surfaces as noisy (harmless) unhandled rejections in any test that touches
// a persisted store. Swap in a minimal in-memory implementation instead.
vi.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    default: {
      getItem: async (key: string) => store.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: async (key: string) => {
        store.delete(key);
      },
      clear: async () => {
        store.clear();
      },
    },
  };
});
