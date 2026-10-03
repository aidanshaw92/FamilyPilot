import { supabase } from '@/src/services/supabase/client';
import { SavedItem, Venue } from '@/src/types';

import {
  BackedUpItem,
  SavedBackupPayload,
  buildSavedBackup,
  parseSavedBackup,
} from './saved-backup-projection';

/**
 * Explicit backup and restore for Saved places. Nothing here runs on its own.
 *
 * NOT A SYNC ENGINE, AND SAYING SO MATTERS. There is no background upload, no write on save, and
 * nothing happens when a parent signs in. Two buttons: put my saved places somewhere safe, and bring
 * them back. `docs/PRIVACY_MODEL.md` classifies saves as Behavioural data and marks them opt-in, and the
 * account screen already promises "Device data has not been automatically uploaded" -- so an automatic
 * upload would make an existing promise false.
 *
 * It is also the honest shape for a first pass. Real bidirectional sync needs per-item timestamps and a
 * deletion tombstone to tell "I un-saved this on my phone" apart from "this phone has not seen it yet",
 * and without tombstones a merge cannot represent a removal at all. Rather than build something that
 * looks like sync and loses removals, this does less and is clear about what it does.
 */

export const BACKUP_TABLE = 'saved_places_backups';

/**
 * The three ways you can fail before doing anything at all, shared by both operations.
 *
 * Declared once because the compiler should enforce that `requireUser`'s failures are assignable to
 * whichever outcome the caller returns. The first version duplicated these three in both unions, and
 * `tsc` caught the result immediately: the restore path tried to return a backup-shaped outcome. The fix
 * is a shared type rather than a cast -- a cast would have compiled and then handed the UI a
 * `backed-up` state from a restore, which the switch would have fallen through.
 *
 * They are three states and not one boolean on purpose. "Not configured" is the owner's doing, "signed
 * out" is a step the parent can take, and "failed" is ours. Collapsing them tells a parent with no
 * account that something went wrong, when nothing has.
 */
export type GateFailure =
  | { state: 'unavailable'; reason: string }
  | { state: 'signed-out'; reason: string }
  | { state: 'failed'; reason: string };

export type BackupOutcome =
  | GateFailure
  | { state: 'backed-up'; items: number; idsWithoutSnapshot: number; truncatedAt?: number; at: string };

export type RestoreOutcome =
  | GateFailure
  | { state: 'nothing-stored'; reason: string }
  | { state: 'unreadable'; reason: string }
  | { state: 'restored'; added: number; alreadyHere: number; backedUpAt: string | null };

export interface StoredBackupSummary {
  items: number;
  updatedAt: string;
}

/** The gate both operations pass through. Returns the user id, or the reason there isn't one. */
async function requireUser(): Promise<{ id: string } | { error: GateFailure }> {
  if (!supabase) {
    return {
      error: {
        state: 'unavailable',
        reason: 'Backing up saved places needs an account, which the app owner has not switched on yet.',
      },
    };
  }
  const { data, error } = await supabase.auth.getSession();
  if (error) return { error: { state: 'failed', reason: 'Could not check your account. Please try again.' } };
  const id = data.session?.user?.id;
  if (!id) {
    return {
      error: {
        state: 'signed-out',
        reason: 'Sign in under Plans, Families and routines to back up your saved places.',
      },
    };
  }
  return { id };
}

/** Uploads the current Saved state. Replaces the stored copy: one backup per account, the latest one. */
export async function backUpSavedPlaces(savedIds: string[], items: SavedItem[]): Promise<BackupOutcome> {
  const user = await requireUser();
  if ('error' in user) return user.error;

  const payload = buildSavedBackup(savedIds, items);
  const at = new Date().toISOString();

  const { error } = await supabase!
    .from(BACKUP_TABLE)
    .upsert({ user_id: user.id, data: payload, updated_at: at }, { onConflict: 'user_id' });

  if (error) {
    return { state: 'failed', reason: 'Your saved places could not be backed up. Nothing has changed on this device.' };
  }

  return {
    state: 'backed-up',
    items: payload.items.length,
    idsWithoutSnapshot: payload.idsWithoutSnapshot.length,
    at,
    ...(payload.truncatedAt ? { truncatedAt: payload.truncatedAt } : {}),
  };
}

/** Reads the stored backup's summary, so the UI can say what is there before anything is changed. */
export async function readBackupSummary(): Promise<StoredBackupSummary | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  if (!data.session?.user?.id) return null;

  const { data: row, error } = await supabase
    .from(BACKUP_TABLE)
    .select('data, updated_at')
    .eq('user_id', data.session.user.id)
    .maybeSingle();

  if (error || !row) return null;
  const payload = parseSavedBackup(row.data);
  if (!payload) return null;
  return { items: payload.items.length, updatedAt: row.updated_at };
}

/**
 * A backed-up item becomes a `SavedItem` again, with the personal parts ABSENT rather than invented.
 *
 * `Venue` requires `driveMinutes` and `familyScore`, and the backup deliberately does not carry either.
 * The tempting move is `driveMinutes: 0` and `score: 0`, and it is the wrong one: the Saved row renders
 * both, so a restored place would claim to be nought minutes away with a nought-percent match. That is
 * a fabricated fact, which this product does not do -- an unknown has to read as unknown.
 *
 * So they come back as `Number.NaN` and a score of `Number.NaN`, which `SavedPlaceRow` renders as "match
 * not worked out yet" and no travel time. NaN rather than `undefined` because the type says these fields
 * exist, and a lie about the type is how `0` gets reintroduced by the next person to touch it.
 */
export function backedUpItemToSavedItem(row: BackedUpItem): SavedItem {
  const venue: Venue = {
    id: row.venue.id,
    name: row.venue.name,
    category: row.venue.category,
    latitude: row.venue.latitude,
    longitude: row.venue.longitude,
    driveMinutes: Number.NaN,
    imageUrl: row.venue.imageUrl ?? '',
    familyScore: {
      score: Number.NaN,
      factors: {
        ageSuitability: Number.NaN,
        accessibility: Number.NaN,
        distance: Number.NaN,
        weatherFit: Number.NaN,
        budgetFit: Number.NaN,
        facilitiesMatch: Number.NaN,
        routineFit: Number.NaN,
      },
      explanation: [],
    },
    ...(row.venue.address ? { address: row.venue.address } : {}),
    ...(row.venue.provider ? { provider: row.venue.provider } : {}),
  };
  return {
    id: row.id,
    type: row.type,
    venue,
    ...(row.group ? { group: row.group } : {}),
    ...(row.savedAt ? { savedAt: row.savedAt } : {}),
  };
}

/**
 * Brings the stored backup down and ADDS what is missing. It never removes anything.
 *
 * "Restore" sounds like "replace", and replace is the wrong behaviour here: a parent who saved three
 * places on this phone and then restored a backup made before those three would lose them, having
 * pressed a button labelled restore. Saved places are a collection, not a document, so a union is both
 * safer and almost always what was wanted.
 *
 * THE LIMITATION, STATED RATHER THAN HIDDEN: because this adds and never removes, un-saving a place on
 * one device is not carried to another. A place removed here and still in the backup comes back on the
 * next restore. Representing a removal needs a tombstone, which needs real sync; see the module note.
 * The UI says this in so many words rather than letting a parent discover it.
 */
export async function restoreSavedPlaces(
  localItems: SavedItem[],
  addItem: (item: SavedItem) => void,
): Promise<RestoreOutcome> {
  const user = await requireUser();
  if ('error' in user) return user.error;

  const { data: row, error } = await supabase!
    .from(BACKUP_TABLE)
    .select('data, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return { state: 'failed', reason: 'Could not reach your backup. Nothing has changed on this device.' };
  if (!row) {
    return { state: 'nothing-stored', reason: 'There is no backup on this account yet. Back up first, from the device that has your places.' };
  }

  const payload: SavedBackupPayload | null = parseSavedBackup(row.data);
  if (!payload) {
    // Refusing beats half-restoring. A payload we cannot read is not a payload to guess at.
    return {
      state: 'unreadable',
      reason: 'That backup was made by a different version of the app and cannot be read safely. Nothing has changed.',
    };
  }

  const here = new Set(localItems.map((item) => item.venue?.id).filter(Boolean));
  let added = 0;
  let alreadyHere = 0;

  for (const stored of payload.items) {
    if (here.has(stored.venue.id)) {
      // Left alone deliberately: the local copy has a real score and travel time, and overwriting it
      // with a restored one that has neither would make the Saved screen worse, not better.
      alreadyHere += 1;
      continue;
    }
    addItem(backedUpItemToSavedItem(stored));
    added += 1;
  }

  return { state: 'restored', added, alreadyHere, backedUpAt: row.updated_at ?? null };
}

/** Removes the stored backup. A parent who put it there must be able to take it down. */
export async function deleteSavedBackup(): Promise<BackupOutcome> {
  const user = await requireUser();
  if ('error' in user) return user.error;
  const { error } = await supabase!.from(BACKUP_TABLE).delete().eq('user_id', user.id);
  if (error) return { state: 'failed', reason: 'The backup could not be removed. Please try again.' };
  return { state: 'backed-up', items: 0, idsWithoutSnapshot: 0, at: new Date().toISOString() };
}
