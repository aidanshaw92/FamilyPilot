/**
 * The one place the reconnect writes to the parent's saved data, called only from a tap on "Yes, this one". Everything it decides is in
 * `applyConfirmedMatch` (pure, tested); this only reads the two stores, applies the outcome and hands it back so the screen can say what happened.
 */
import { usePlanningStore } from '@/src/stores/planning-store';
import { useSavedStore } from '@/src/stores/saved-store';
import type { Venue } from '@/src/types';

import { applyConfirmedMatch, type ReconnectOutcome } from './reconnect-apply';

export function confirmReconnect(oldId: string, venue: Venue): ReconnectOutcome {
  const saved = useSavedStore.getState();
  const planning = usePlanningStore.getState();
  const outcome = applyConfirmedMatch({ items: saved.items, savedIds: saved.savedIds }, planning.savedDays, oldId, venue);
  useSavedStore.setState({ items: outcome.items, savedIds: outcome.savedIds });
  if (outcome.daysRepointed > 0) usePlanningStore.setState({ savedDays: outcome.days });
  return outcome;
}

/** What to tell the parent after a confirmed match, in plain words (no "migration", no "alias"). */
export function reconnectMessage(name: string, outcome: ReconnectOutcome): string {
  const parts = [outcome.alreadySaved ? `${name} was already saved, so that is the one we kept.` : `${name} is now your saved place.`];
  if (outcome.daysRepointed > 0) parts.push('Plans you have already made are unchanged.');
  return parts.join(' ');
}
