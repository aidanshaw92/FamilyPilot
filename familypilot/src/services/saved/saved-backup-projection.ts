import { SavedGroup, SavedItem, Venue } from '@/src/types';

/**
 * What a Saved place looks like once the personal parts are taken out of it.
 *
 * THIS FILE IS THE PRIVACY CONTROL, NOT A SERIALISER. A `SavedItem` carries a whole `Venue`, and a
 * `Venue` carries more about the family than it looks like it does:
 *
 *   - `driveMinutes` is the distance from THIS FAMILY'S HOME. Upload it for twenty saved places and the
 *     set of distances narrows down where they live.
 *   - `familyScore.explanation` is plain English about the family. The real strings include
 *     "Only 12 minutes from home", "Further than your usual 30 min drive", and the nap/feed routine
 *     reason — which is about their children.
 *   - `familyScore.factors` holds the same thing as numbers, including `ageSuitability` and
 *     `routineFit`, both derived from the children.
 *   - `trustedFacts` and `trust` are venue facts rather than family facts, but they are large, they go
 *     stale, and nothing on the Saved screen needs them to render a row.
 *
 * The owner's decision is that children's data stays off the cloud pending a GDPR-K/COPPA view. That
 * decision is worth very little as an intention and quite a lot as a function, so this is the function:
 * an allowlist, not a blocklist, so a field added to `Venue` later is excluded by default rather than
 * included by accident.
 *
 * STRIPPING THEM IS ALSO MORE CORRECT, WHICH IS THE PART THAT MAKES THIS EASY. A cached score is a
 * score for the profile that computed it. Restore a snapshot that says "12 minutes from home" onto a
 * phone belonging to a family who have since moved, or whose children are two years older, and the
 * number is not stale-but-roughly-right, it is wrong. The right thing to restore is the identity of the
 * place; the right time to score it is when it is next looked at, against the profile that exists then.
 */

/** Bump when the shape changes. A reader that does not recognise a version refuses rather than guesses. */
export const SAVED_BACKUP_VERSION = 1;

/**
 * A ceiling on how much one account can store, so a bug cannot turn a jsonb column into a dumping
 * ground. Generous against real use: a family with more than 500 saved places is not a case this needs
 * to serve on the first pass, and the backup says plainly when it has truncated.
 */
export const MAX_BACKED_UP_ITEMS = 500;

/** The public, non-personal half of a venue: enough to recognise the place and fetch it again. */
export interface BackedUpVenue {
  id: string;
  name: string;
  category: Venue['category'];
  latitude: number;
  longitude: number;
  address?: string;
  imageUrl?: string;
  provider?: Venue['provider'];
}

export interface BackedUpItem {
  id: string;
  type: SavedItem['type'];
  group?: SavedGroup;
  savedAt?: string;
  venue: BackedUpVenue;
}

export interface SavedBackupPayload {
  version: number;
  items: BackedUpItem[];
  /**
   * Ids the parent saved for which no venue snapshot exists locally, so there is nothing to restore
   * but the fact that they saved it. Kept separate rather than mixed in, because an id is not a place
   * and pretending otherwise would put a nameless row on the Saved screen.
   *
   * These arise from `toggleSaved(venueId)` with no venue argument, which the store supports for
   * callers that only know an id.
   */
  idsWithoutSnapshot: string[];
  /** Set when MAX_BACKED_UP_ITEMS truncated the upload, so the UI can say so instead of quietly losing rows. */
  truncatedAt?: number;
}

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Only the allowlisted fields, and only when they are the type they claim to be. */
function projectVenue(venue: Venue): BackedUpVenue | null {
  if (!isNonEmptyString(venue?.id) || !isNonEmptyString(venue?.name)) return null;
  if (!isFiniteNumber(venue?.latitude) || !isFiniteNumber(venue?.longitude)) return null;

  const projected: BackedUpVenue = {
    id: venue.id,
    name: venue.name,
    category: venue.category,
    latitude: venue.latitude,
    longitude: venue.longitude,
  };
  // Optional, and omitted rather than sent as undefined, so the stored JSON has no null clutter.
  if (isNonEmptyString(venue.address)) projected.address = venue.address;
  if (isNonEmptyString(venue.imageUrl)) projected.imageUrl = venue.imageUrl;
  if (isNonEmptyString(venue.provider)) projected.provider = venue.provider;
  return projected;
}

/**
 * Builds the payload for upload from the store's current state.
 *
 * Takes `savedIds` as well as `items` because the two can legitimately diverge, and the difference is
 * information rather than a bug to paper over.
 */
export function buildSavedBackup(savedIds: string[], items: SavedItem[]): SavedBackupPayload {
  const projected: BackedUpItem[] = [];
  const withSnapshot = new Set<string>();

  for (const item of items) {
    const venue = projectVenue(item?.venue);
    if (!venue) continue;
    withSnapshot.add(venue.id);
    const row: BackedUpItem = { id: item.id, type: item.type, venue };
    if (item.group) row.group = item.group;
    if (isNonEmptyString(item.savedAt)) row.savedAt = item.savedAt;
    projected.push(row);
  }

  const payload: SavedBackupPayload = {
    version: SAVED_BACKUP_VERSION,
    items: projected.slice(0, MAX_BACKED_UP_ITEMS),
    idsWithoutSnapshot: (savedIds ?? []).filter((id) => isNonEmptyString(id) && !withSnapshot.has(id)),
  };
  if (projected.length > MAX_BACKED_UP_ITEMS) payload.truncatedAt = MAX_BACKED_UP_ITEMS;
  return payload;
}

/**
 * Reads a payload back, defensively.
 *
 * The row came out of a database, so it is data rather than something to trust: a hand-edited row, a
 * payload from a newer app version, or a half-written object must all produce "nothing usable" instead
 * of throwing inside a React render.
 */
export function parseSavedBackup(raw: unknown): SavedBackupPayload | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const candidate = raw as Partial<SavedBackupPayload>;
  // An unknown version is refused outright. Guessing at a shape we do not know is how a restore
  // silently drops half a parent's list.
  if (candidate.version !== SAVED_BACKUP_VERSION) return null;
  if (!Array.isArray(candidate.items)) return null;

  const items: BackedUpItem[] = [];
  for (const entry of candidate.items) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Partial<BackedUpItem>;
    const venue = row.venue as BackedUpVenue | undefined;
    if (!venue || !isNonEmptyString(venue.id) || !isNonEmptyString(venue.name)) continue;
    if (!isFiniteNumber(venue.latitude) || !isFiniteNumber(venue.longitude)) continue;
    if (!isNonEmptyString(row.id) || !isNonEmptyString(row.type)) continue;
    items.push(row as BackedUpItem);
  }

  return {
    version: SAVED_BACKUP_VERSION,
    items,
    idsWithoutSnapshot: Array.isArray(candidate.idsWithoutSnapshot)
      ? candidate.idsWithoutSnapshot.filter(isNonEmptyString)
      : [],
    ...(typeof candidate.truncatedAt === 'number' ? { truncatedAt: candidate.truncatedAt } : {}),
  };
}
