import type { Venue, VenueDetail } from '@/src/types';

/**
 * What the screen a parent taps INTO can show before its own data arrives: the card they just tapped.
 *
 * A card already carries the place's name, photograph, category, travel time and the Family Fit badge, so opening the
 * place can show those at once instead of a blank skeleton for as long as the detail request takes. This module is the
 * hand-over, and it is deliberately narrow about what that hand-over means:
 *
 *   - It is PRESENTATION data only. It is returned to React Query as `placeholderData`, which is never written to the
 *     query cache, never counts as fresh, and is replaced wholesale (not merged) by the real detail the moment it
 *     arrives. Nothing here is ever stored as the place's detail.
 *   - It is partial and says so. The placeholder has no description, no opening-hours text, no phone or website, and one
 *     photograph; `isPlaceholderData` is true while it is on screen, and the venue screen draws only what a card knows
 *     (identity, photograph, fit badge) and leaves everything evidence-backed (the fit explanation, today's opening
 *     state, what to know, the plan action) as a labelled placeholder until the full detail is in.
 *   - It is short-lived. A card from a few minutes ago is no longer what the parent saw; the seed expires, and a
 *     deep link or a reload has none.
 *   - It never outranks anything richer. If the detail is already in the cache, `placeholderData` is not used at all.
 */
const SEED_TTL_MS = 5 * 60 * 1000;
const SEED_LIMIT = 30;
const seeds = new Map<string, { venue: Venue; at: number }>();

/** Remember the card the parent just tapped. Call it immediately before navigating to the place. */
export function seedVenueDetail(venue: Venue, now: number = Date.now()): void {
  if (!venue?.id) return;
  // Only a card that was actually scored for this family. A saved place restored from a backup arrives with no match and
  // no travel time on purpose; standing it in for the detail would show a fit nobody has judged.
  if (!venue.familyMatch || !Number.isFinite(venue.familyScore?.score) || !Number.isFinite(venue.driveMinutes)) return;
  seeds.delete(venue.id);
  seeds.set(venue.id, { venue, at: now });
  // Oldest first: a Map iterates in insertion order.
  while (seeds.size > SEED_LIMIT) {
    const oldest = seeds.keys().next().value;
    if (oldest === undefined) break;
    seeds.delete(oldest);
  }
}

/**
 * The card as the stand-in for the detail, or undefined when there is none worth showing. Fields only the full detail
 * knows are given their empty value, never a guess.
 */
export function venueDetailPlaceholder(id: string, now: number = Date.now()): VenueDetail | undefined {
  const seed = seeds.get(id);
  if (!seed) return undefined;
  if (now - seed.at > SEED_TTL_MS) {
    seeds.delete(id);
    return undefined;
  }
  const { venue } = seed;
  return {
    ...venue,
    photos: venue.imageUrl ? [venue.imageUrl] : [],
    facilities: venue.facilities ?? [],
    openingHours: '',
    description: '',
  };
}

/** For tests. */
export function clearVenueDetailSeeds(): void {
  seeds.clear();
}
