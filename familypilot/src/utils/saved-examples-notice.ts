import { Venue } from '@/src/types';

/**
 * Explore falls back to a bundled list when live places cannot be reached, so the screen is never blank
 * during an outage. Those venues are marked `provider: 'mock'` and each card already reads "Not yet
 * reviewed", but nothing said *why the whole list looks different*. A parent comparing it with
 * yesterday's would reasonably think places had vanished. This says it once, above the list, and only
 * when every venue shown is one of the bundled examples: a mixed or live list gets no notice.
 */
export const SAVED_EXAMPLES_NOTICE = 'Live places aren’t loading right now, so these are saved examples.';

export function showingSavedExamples(venues: readonly Pick<Venue, 'provider'>[] | undefined | null): boolean {
  return Boolean(venues && venues.length > 0 && venues.every((venue) => venue.provider === 'mock'));
}
