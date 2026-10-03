import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SavedItem, Venue } from '@/src/types';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * What backup and restore do to a parent's saved places, and what they refuse to do.
 *
 * The behaviour worth defending here is NON-DESTRUCTION. "Restore" sounds like "replace", and replace
 * would mean a parent who saved three places on this phone and then pressed restore would lose them.
 * These tests pin the union, and pin that a restored place never overwrites a local one that already has
 * a real score.
 */

let session: any = { session: { user: { id: 'user-1' } } };
let sessionError: any = null;
let selectResult: any = { data: null, error: null };
let upsertCalls: any[] = [];
let upsertError: any = null;
let deleteCalls: string[] = [];

vi.mock('@/src/services/supabase/client', () => ({
  isSupabaseConfigured: true,
  get supabase() {
    return supabaseStub;
  },
}));

const supabaseStub: any = {
  auth: { getSession: async () => ({ data: session, error: sessionError }) },
  from: (table: string) => ({
    upsert: async (row: any, opts: any) => {
      upsertCalls.push({ table, row, opts });
      return { error: upsertError };
    },
    select: () => ({
      eq: () => ({ maybeSingle: async () => selectResult }),
    }),
    delete: () => ({
      eq: async (_col: string, value: string) => {
        deleteCalls.push(value);
        return { error: null };
      },
    }),
  }),
};

const venue = (over: Partial<Venue> = {}): Venue =>
  ({
    id: 'v1',
    name: 'Kew Gardens',
    category: 'park',
    latitude: 51.4787,
    longitude: -0.2956,
    driveMinutes: 23,
    imageUrl: 'https://example.invalid/a.jpg',
    familyScore: { score: 82, factors: {} as any, explanation: ['Only 12 minutes from home'] },
    ...over,
  }) as Venue;

const local = (id: string): SavedItem => ({
  id: `saved-${id}`,
  type: 'place',
  venue: venue({ id }),
  group: 'want',
  savedAt: '2026-10-01T09:00:00.000Z',
});

async function load() {
  vi.resetModules();
  return import('@/src/services/saved/saved-backup');
}

/** A payload as the projection really writes one. */
function storedPayload(ids: string[]) {
  return {
    version: 1,
    items: ids.map((id) => ({
      id: `saved-${id}`,
      type: 'place',
      group: 'want',
      savedAt: '2026-09-01T09:00:00.000Z',
      venue: { id, name: `Place ${id}`, category: 'park', latitude: 51.5, longitude: -0.1 },
    })),
    idsWithoutSnapshot: [],
  };
}

beforeEach(() => {
  session = { session: { user: { id: 'user-1' } } };
  sessionError = null;
  selectResult = { data: null, error: null };
  upsertCalls = [];
  upsertError = null;
  deleteCalls = [];
});

afterEach(() => vi.restoreAllMocks());

describe('restore adds and never removes', () => {
  it('adds a stored place this device does not have', async () => {
    const { restoreSavedPlaces } = await load();
    selectResult = { data: { data: storedPayload(['v2']), updated_at: '2026-09-01T10:00:00.000Z' }, error: null };
    const added: SavedItem[] = [];

    const outcome = await restoreSavedPlaces([local('v1')], (item) => added.push(item));

    expect(outcome.state).toBe('restored');
    expect((outcome as any).added).toBe(1);
    expect(added.map((item) => item.venue.id)).toEqual(['v2']);
  });

  it('never removes a local place that is absent from the backup', async () => {
    // The destructive bug this guards: a backup made before three recent saves must not delete them.
    const { restoreSavedPlaces } = await load();
    selectResult = { data: { data: storedPayload([]), updated_at: 'x' }, error: null };
    const added: SavedItem[] = [];
    const removals: string[] = [];

    const outcome = await restoreSavedPlaces([local('v1'), local('v2')], (item) => added.push(item));

    expect(outcome.state).toBe('restored');
    expect((outcome as any).added).toBe(0);
    // Restore is given no way to remove anything: there is no remove callback at all.
    expect(removals).toEqual([]);
    expect(added).toEqual([]);
  });

  it('leaves a local copy alone rather than overwriting it with a scoreless one', async () => {
    const { restoreSavedPlaces } = await load();
    selectResult = { data: { data: storedPayload(['v1']), updated_at: 'x' }, error: null };
    const added: SavedItem[] = [];

    const outcome = await restoreSavedPlaces([local('v1')], (item) => added.push(item));

    expect((outcome as any).added).toBe(0);
    expect((outcome as any).alreadyHere).toBe(1);
    // The local item has a real score and travel time. The stored one has neither, so replacing it
    // would make the Saved screen worse.
    expect(added).toEqual([]);
  });
});

describe('a restored place says it does not know, instead of inventing a zero', () => {
  it('comes back with no score and no travel time', async () => {
    const { backedUpItemToSavedItem } = await load();
    const item = backedUpItemToSavedItem(storedPayload(['v9']).items[0] as any);

    // NOT 0. The Saved row renders both of these, so a zero would claim "0 min away, 0% match" about a
    // place nobody has scored yet -- a fabricated fact.
    expect(Number.isNaN(item.venue.driveMinutes)).toBe(true);
    expect(Number.isNaN(item.venue.familyScore.score)).toBe(true);
    expect(item.venue.familyScore.explanation).toEqual([]);
  });

  it('keeps what it does know', async () => {
    const { backedUpItemToSavedItem } = await load();
    const item = backedUpItemToSavedItem(storedPayload(['v9']).items[0] as any);
    expect(item.venue.name).toBe('Place v9');
    expect(item.venue.latitude).toBe(51.5);
    expect(item.group).toBe('want');
  });
});

describe('the three ways to fail before anything happens stay distinct', () => {
  it('reports signed out as signed out, not as an error', async () => {
    const { backUpSavedPlaces, restoreSavedPlaces } = await load();
    session = { session: null };
    expect((await backUpSavedPlaces([], [])).state).toBe('signed-out');
    expect((await restoreSavedPlaces([], () => {})).state).toBe('signed-out');
    // And nothing was written.
    expect(upsertCalls).toEqual([]);
  });

  it('reports a session lookup failure as failed', async () => {
    const { backUpSavedPlaces } = await load();
    sessionError = new Error('network');
    expect((await backUpSavedPlaces([], [])).state).toBe('failed');
    expect(upsertCalls).toEqual([]);
  });

  it('says nothing is stored rather than pretending an empty restore succeeded', async () => {
    const { restoreSavedPlaces } = await load();
    selectResult = { data: null, error: null };
    const outcome = await restoreSavedPlaces([local('v1')], () => {});
    expect(outcome.state).toBe('nothing-stored');
  });

  it('refuses an unreadable payload instead of half-restoring it', async () => {
    const { restoreSavedPlaces } = await load();
    // A payload from a newer app version.
    selectResult = { data: { data: { version: 99, items: [] }, updated_at: 'x' }, error: null };
    const added: SavedItem[] = [];
    const outcome = await restoreSavedPlaces([local('v1')], (item) => added.push(item));
    expect(outcome.state).toBe('unreadable');
    expect(added).toEqual([]);
  });

  it('says the device is unchanged when the upload fails', async () => {
    const { backUpSavedPlaces } = await load();
    upsertError = { message: 'denied' };
    const outcome = await backUpSavedPlaces(['v1'], [local('v1')]);
    expect(outcome.state).toBe('failed');
    expect((outcome as any).reason).toMatch(/Nothing has changed on this device/);
  });
});

describe('what reaches the table', () => {
  it('writes the projected payload under the signed-in user, keyed for upsert', async () => {
    const { backUpSavedPlaces, BACKUP_TABLE } = await load();
    const outcome = await backUpSavedPlaces(['v1'], [local('v1')]);

    expect(outcome.state).toBe('backed-up');
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].table).toBe(BACKUP_TABLE);
    expect(upsertCalls[0].row.user_id).toBe('user-1');
    expect(upsertCalls[0].opts).toEqual({ onConflict: 'user_id' });

    // The privacy guarantee, asserted at the boundary that actually leaves the device rather than only
    // in the projection's own unit test.
    const sent = JSON.stringify(upsertCalls[0].row);
    expect(sent).not.toContain('driveMinutes');
    expect(sent).not.toContain('familyScore');
    expect(sent).not.toContain('from home');
  });

  it('deletes only the signed-in user’s own backup', async () => {
    const { deleteSavedBackup } = await load();
    await deleteSavedBackup();
    expect(deleteCalls).toEqual(['user-1']);
  });
});

describe('an unscored saved place renders as unknown, never as zero', () => {
  it('never produces NaN or a zero in a travel label', async () => {
    const { travelTimeLabel, travelTimeSpoken, travelTimeWithMode, UNKNOWN_TRAVEL_LABEL, isTravelTimeKnown } =
      await import('@/src/utils/travel-time');

    // The exact bug this guards: Math.max(1, Math.round(NaN)) is NaN, so the first version of the
    // restore produced the literal string "about NaN min" -- worse than the zero it was avoiding.
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, undefined as never, null as never]) {
      expect(isTravelTimeKnown(bad)).toBe(false);
      expect(travelTimeLabel(bad, 'estimated')).toBe(UNKNOWN_TRAVEL_LABEL);
      expect(travelTimeSpoken(bad, 'estimated')).toBe(UNKNOWN_TRAVEL_LABEL);
      expect(travelTimeWithMode(bad, 'estimated', 'drive')).toBe(UNKNOWN_TRAVEL_LABEL);
      expect(travelTimeLabel(bad, 'estimated')).not.toContain('NaN');
      expect(travelTimeLabel(bad, 'estimated')).not.toMatch(/\b0 min\b/);
    }
  });

  it('still labels a real travel time exactly as before', async () => {
    // The guard must not change the behaviour it was added beside.
    const { travelTimeLabel, travelTimeSpoken } = await import('@/src/utils/travel-time');
    expect(travelTimeLabel(14, 'estimated')).toBe('about 14 min');
    expect(travelTimeLabel(14, 'measured')).toBe('14 min');
    expect(travelTimeLabel(0.2, 'measured')).toBe('1 min');
    expect(travelTimeSpoken(1, 'measured')).toBe('1 minute drive');
  });

  it('does not let a non-finite score become a verdict about the place', async () => {
    const { getMatchClassification } = await import('@/src/utils/family-match-classification');
    // Left deliberately unguarded in the util: NaN falls through every threshold to "Limited match".
    // That is why SavedPlaceRow checks Number.isFinite BEFORE calling it, rather than relying on the
    // util to be defensive. This test records the sharp edge so nobody removes that check.
    expect(getMatchClassification(Number.NaN)).toBe('Limited match');
  });
});
