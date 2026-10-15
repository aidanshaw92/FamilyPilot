/**
 * What happens to a parent's saved data when they confirm "yes, this is the same place". Pure, so every rule below is tested without a screen.
 *
 *  - The saved row points at the confirmed venue and keeps its group, its saved time and its own row id (`reconnectSaved`).
 *  - A saved day that was built from the old venue is rebuilt from the new one next time (`reconnectDays`: only its draft's venue id changes).
 *  - A saved day's itinerary and a plan already made are NEVER touched: they are what was planned, with the times and stops the parent chose.
 *  - If the parent had already saved the confirmed venue, they keep that row and the old one is dropped (two rows for one place would be a bug), and
 *    they are told so rather than left to wonder where the second one went.
 *  - Nothing is deleted or rewritten unless the parent confirmed one match. Declining changes nothing at all.
 */
import type { SavedDay } from '@/src/stores/planning-store';
import type { SavedItem, Venue } from '@/src/types';

import { reconnectDays, reconnectIds, reconnectSaved } from './reconnect';

export interface SavedSnapshot { items: readonly SavedItem[]; savedIds: readonly string[] }
export interface ReconnectOutcome {
  items: SavedItem[];
  savedIds: string[];
  days: SavedDay[];
  /** The parent had already saved the venue they confirmed: their existing row was kept and the old one dropped. */
  alreadySaved: boolean;
  /** How many saved days will now rebuild from the new venue (their itineraries are unchanged). */
  daysRepointed: number;
}

export function applyConfirmedMatch(saved: SavedSnapshot, days: readonly SavedDay[], oldId: string, venue: Venue): ReconnectOutcome {
  // Never act on a match the parent did not confirm, and never point a row at the id it already has.
  if (!saved.items.some((item) => item.venue.id === oldId) || oldId === venue.id) {
    return { items: [...saved.items], savedIds: [...saved.savedIds], days: [...days], alreadySaved: false, daysRepointed: 0 };
  }
  const alreadySaved = saved.items.some((item) => item.venue.id === venue.id);
  const items = alreadySaved ? saved.items.filter((item) => item.venue.id !== oldId) : reconnectSaved(saved.items, oldId, venue);
  const savedIds = reconnectIds(saved.savedIds, oldId, venue.id);
  const repointed = reconnectDays(days, oldId, venue.id);
  const daysRepointed = repointed.filter((day, index) => day !== days[index]).length;
  return { items: [...items], savedIds, days: repointed, alreadySaved, daysRepointed };
}
