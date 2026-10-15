import { useQuery } from '@tanstack/react-query';

import { lookUpSuccessor, mayHaveLostItsListing } from '@/src/services/saved/reconnect-lookup';
import type { SavedItem } from '@/src/types';

/**
 * What today's catalogue says about one saved place. `undefined` data means "not known" (not asked yet, not eligible, or the catalogue did not answer),
 * and the screens treat that as nothing to show: only a clear "this id is not listed" ever produces an offer. No retries: a place that is listed answers
 * once, and a failed request must not be repeated into a flood.
 */
export function useSavedSuccessor(item: SavedItem | undefined) {
  const eligible = Boolean(item) && mayHaveLostItsListing(item as SavedItem);
  return useQuery({
    queryKey: ['saved-successor', item?.venue.id ?? ''],
    queryFn: () => lookUpSuccessor(item as SavedItem),
    enabled: eligible,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
}
