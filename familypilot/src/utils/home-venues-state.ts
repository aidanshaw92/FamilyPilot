/**
 * What Home shows, from its two sources: the fresh list and the list this device last loaded (kept).
 *
 *   fresh list in hand            → the fresh list
 *   only the kept list            → the kept list, refreshed in place when the fresh one arrives
 *   neither, still loading        → loading (the deck-shaped skeleton: a first run only)
 *   fresh failed, nothing kept    → error (with retry)
 *   fresh failed, kept in hand    → the kept list: an outage never replaces picks the parent can already see
 *
 * Pure, so the states a parent can see are pinned in tests rather than only in a browser.
 */
export interface HomeVenuesSources<T> {
  live: { data: T[] | undefined; isLoading: boolean; isError: boolean; isFetching: boolean };
  kept: { data: T[] | null | undefined; isLoading: boolean };
}

export interface HomeVenuesState<T> {
  venues: T[] | undefined;
  isLoading: boolean;
  isError: boolean;
  /** The kept list is on screen while a fresh one loads. */
  isRefreshing: boolean;
}

export function resolveHomeVenues<T>({ live, kept }: HomeVenuesSources<T>): HomeVenuesState<T> {
  const keptList = kept.data ?? undefined;
  const venues = live.data ?? keptList;
  return {
    venues,
    isLoading: !venues && (live.isLoading || kept.isLoading),
    isError: !venues && live.isError,
    isRefreshing: !live.data && Boolean(keptList) && live.isFetching,
  };
}
