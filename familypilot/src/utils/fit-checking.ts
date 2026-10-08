/**
 * Whether Venue Detail should show Family Fit as "checking recent parent reports" instead of a verdict.
 *
 * True only when ALL hold: the full detail is on screen (a card standing in for it is replaced, never corrected), the server
 * said a parent report from the last 90 days could still correct a fact on the page, and those reports have not arrived
 * yet. `reportsLoading` is the reports query's first load, so it ends when they arrive, when the read fails, or after the
 * three second ceiling in `fetchParentObservations`: the neutral state can never last longer than that.
 *
 * `false`/absent/`null` flags never wait: with no known reason to expect a correction the page shows the venue's own facts at once
 * (the same as before this change), and a report that still arrives is applied as it always was.
 */
export function fitIsBeingChecked(input: {
  pending: boolean;
  hasRecentParentReports: boolean | null | undefined;
  reportsLoading: boolean;
}): boolean {
  return !input.pending && input.hasRecentParentReports === true && input.reportsLoading;
}
