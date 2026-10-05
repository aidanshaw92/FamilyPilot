import { parentObservationsFromTrust, ParentObservations } from '@/src/services/matching/parent-observations';
import { feedbackApi, VenueTrust } from './feedback';

/**
 * The parent observations Family Fit may use for ONE venue page: a single read of the public summary, filtered by the
 * confidence contract. Best effort and silent: with no backend, a slow one or an error, Family Fit simply has nothing
 * parent-reported to say, which is exactly its state today. Never called for lists (cards stay on official facts).
 */
export async function fetchParentObservations(venueId: string): Promise<ParentObservations | undefined> {
  try {
    // Never hold the venue page for this: three seconds, then Family Fit goes ahead on the venue's own facts.
    const trust = (await Promise.race([
      feedbackApi(`?venueId=${encodeURIComponent(venueId)}`),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ])) as VenueTrust;
    const observations = parentObservationsFromTrust(trust);
    return Object.keys(observations).length > 0 ? observations : undefined;
  } catch {
    return undefined;
  }
}
