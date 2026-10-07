/**
 * Wait for a soft input, but never longer than `ms`.
 *
 * Some things a screen would LIKE to have (today's weather as one extra line, say) must never be allowed to hold the
 * screen itself. This resolves to the value if it arrives in time, and to `fallback` otherwise (also when it rejects), and
 * clears its timer either way so nothing is left running. The late value is simply not used by this caller; the
 * underlying request is not cancelled here.
 */
export function withinMs<T, F>(work: Promise<T>, ms: number, fallback: F): Promise<T | F> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}
