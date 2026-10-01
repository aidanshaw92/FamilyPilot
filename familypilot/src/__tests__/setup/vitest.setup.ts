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

/**
 * No test may spend money.
 *
 * September 2026 produced a £104.11 Google Places bill, and nothing in the repository could have
 * told us whether the test suite was part of it. `server/places/lib/places-budget.js` refuses
 * billable calls under a test runtime, but a guard is only as good as the thing that proves it
 * holds, and a future module could always reach `fetch` directly without going through the gate.
 *
 * So this wraps global `fetch` for the whole suite and throws on any request to a billing host. It
 * is a tripwire, not a mock: every other host passes straight through, so a test that stubs fetch
 * itself is unaffected, and a test that genuinely needs a local HTTP server still works.
 *
 * If this throws, the fix is to route the call through the gate and stub it in the test -- not to
 * add the host to the list.
 */
const BILLING_HOSTS = [
  'places.googleapis.com',
  'maps.googleapis.com',
  'routes.googleapis.com',
  'maps.google.com/maps/api',
];

const realFetch = globalThis.fetch;
if (typeof realFetch === 'function') {
  globalThis.fetch = ((input: Parameters<typeof realFetch>[0], init?: Parameters<typeof realFetch>[1]) => {
    const target =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : ((input as Request)?.url ?? '');
    const host = BILLING_HOSTS.find((candidate) => target.includes(candidate));
    if (host) {
      throw new Error(
        `A test attempted a billable request to ${host} (${target.slice(0, 120)}). ` +
          'Tests must never call a paid Google API. Route the call through ' +
          'server/places/lib/places-budget.js and stub it in the test.',
      );
    }
    return realFetch(input, init);
  }) as typeof realFetch;
}
