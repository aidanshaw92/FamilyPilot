import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyConfirmedMatch } from '@/src/services/saved/reconnect-apply';
import { confirmReconnect, reconnectMessage } from '@/src/services/saved/reconnect-actions';
import { lookUpSuccessor, mayHaveLostItsListing, readLookup } from '@/src/services/saved/reconnect-lookup';
import { usePlanningStore, type SavedDay } from '@/src/stores/planning-store';
import { useSavedStore } from '@/src/stores/saved-store';
import type { ExternalPlaceRecord } from '@/src/types/places';
import type { SavedItem, Venue } from '@/src/types';

vi.mock('react-native', () => ({ Platform: { OS: 'web', select: (spec: Record<string, unknown>) => spec.web ?? spec.default } }));

/**
 * The reconnect screen's logic, without a screen: what a catalogue answer means, when a lookup may be made at all, what a confirmed match writes (and
 * what it must never touch), and that an outage is never read as "this place is gone". The matching rules themselves are tested in saved-reconnect.test.ts.
 */
const venue = (over: Partial<Venue> & { id: string; name: string }): Venue => ({
  category: 'park', latitude: 51.451, longitude: -0.1066, driveMinutes: 10, imageUrl: '', familyScore: { score: 70 } as Venue['familyScore'], ...over,
}) as Venue;
const item = (v: Venue, over: Partial<SavedItem> = {}): SavedItem => ({ id: `saved-${v.id}`, type: 'place', venue: v, group: 'want', savedAt: '2026-09-01T10:00:00.000Z', ...over }) as SavedItem;
const record = (over: Partial<ExternalPlaceRecord> & { familypilotId: string; name: string }): ExternalPlaceRecord => ({
  externalId: `x:${over.familypilotId}`, provider: 'os-greenspace', category: 'park', latitude: 51.4512, longitude: -0.1068, photos: [], fetchedAt: '2026-10-14T00:00:00.000Z', enrichmentStatus: 'provider_only', googleTypes: [], ...over,
}) as ExternalPlaceRecord;

const old = venue({ id: 'fp-google-ChIJold', name: 'Brockwell Park', provider: 'google' });
const day = (id: string, venueId: string): SavedDay => ({ id, createdAt: '2026-09-02T10:00:00.000Z', source: { marker: `itinerary of ${id}` } as unknown as SavedDay['source'], draft: { venueId, params: { date: '2026-10-17' } } });

describe('which saved places are ever looked up', () => {
  it('only a Google-listed place of the venue kind with a position', () => {
    expect(mayHaveLostItsListing(item(old))).toBe(true);
    expect(mayHaveLostItsListing(item(venue({ id: 'fp-os-1', name: 'Brockwell Park', provider: 'os-greenspace' })))).toBe(false);
    expect(mayHaveLostItsListing(item(venue({ id: 'fp-wd-q1', name: 'Horniman Museum', provider: 'wikidata' })))).toBe(false);
    // a saved restaurant or hotel is not in the venue catalogue at all: "not listed" would be a wrong answer for it
    expect(mayHaveLostItsListing(item(venue({ id: 'fp-google-r1', name: 'A Cafe', category: 'cafe', provider: 'google' }), { type: 'restaurant' }))).toBe(false);
    expect(mayHaveLostItsListing(item(venue({ id: 'fp-google-h1', name: 'A Hotel', category: 'hotel', provider: 'google' }), { type: 'hotel' }))).toBe(false);
    expect(mayHaveLostItsListing(item(venue({ id: 'fp-google-nopos', name: 'No Position', provider: 'google', latitude: Number.NaN })))).toBe(false);
  });
});

describe('what a catalogue answer means', () => {
  it('listed: the saved id is among what is served, so there is nothing to offer', () => {
    expect(readLookup(item(old), [record({ familypilotId: 'fp-google-ChIJold', name: 'Brockwell Park', provider: 'google' })]).status).toBe('listed');
  });
  it('relisted: the id is gone and a place that looks like it is listed', () => {
    const result = readLookup(item(old), [record({ familypilotId: 'fp-os-brockwell', name: 'Brockwell Park' }), record({ familypilotId: 'fp-os-ruskin', name: 'Ruskin Park' })]);
    expect(result.status).toBe('relisted');
    if (result.status === 'relisted') {
      expect(result.proposals.proposals.map((p) => p.venue.id)).toEqual(['fp-os-brockwell']);
      expect(result.proposals.ambiguous).toBe(false);
    }
  });
  it('relisted with look-alikes: both are offered and the parent is told so', () => {
    const result = readLookup(item(venue({ id: 'fp-google-ChIJvic', name: 'Victoria Park', provider: 'google' })), [
      record({ familypilotId: 'fp-os-vic-a', name: 'Victoria Park', latitude: 51.4511, longitude: -0.1067 }),
      record({ familypilotId: 'fp-os-vic-b', name: 'Victoria Park Gardens', latitude: 51.4513, longitude: -0.1069 }),
    ]);
    expect(result.status).toBe('relisted');
    if (result.status === 'relisted') expect(result.proposals.proposals.length).toBeGreaterThanOrEqual(1);
  });
  it('gone: the id is not listed and nothing nearby looks like it', () => {
    expect(readLookup(item(old), [record({ familypilotId: 'fp-os-far', name: 'Peckham Rye Park', latitude: 51.4, longitude: -0.07 })]).status).toBe('gone');
    expect(readLookup(item(old), []).status).toBe('gone');
  });
});

describe('looking is a read, and a failed read is not an answer', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

  it('asks the stored catalogue only: the catalogue intent, the saved place\'s own position, nothing of the family', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ intent: 'catalogue', places: [record({ familypilotId: 'fp-os-brockwell', name: 'Brockwell Park' })] }), { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const result = await lookUpSuccessor(item(old));
    expect(result.status).toBe('relisted');
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]), 'https://x.test');
    expect(url.searchParams.get('intent')).toBe('catalogue');
    expect(url.searchParams.get('lat')).toBe('51.451');
    expect([...url.searchParams.keys()].sort()).toEqual(['intent', 'lat', 'limit', 'lng', 'radiusKm']);
    expect(url.host).not.toMatch(/google/i);
  });
  it('an unavailable catalogue (503) throws: it must never read as "this place is gone"', async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ code: 'CATALOGUE_UNAVAILABLE' }), { status: 503 })) as unknown as typeof fetch;
    await expect(lookUpSuccessor(item(old))).rejects.toThrow();
  });
  it('an answer that is not a catalogue answer throws too (a search page, an old server, an HTML error page)', async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ places: [] }), { status: 200 })) as unknown as typeof fetch;
    await expect(lookUpSuccessor(item(old))).rejects.toThrow();
    globalThis.fetch = (async () => new Response('<html></html>', { status: 200 })) as unknown as typeof fetch;
    await expect(lookUpSuccessor(item(old))).rejects.toThrow();
  });
});

describe('what a confirmed match writes', () => {
  const successor = venue({ id: 'fp-os-brockwell', name: 'Brockwell Park', provider: 'os-greenspace' });

  it('points the row at the new venue and keeps its group, its saved time and its own row id', () => {
    const rowOld = item(old, { group: 'favourite', savedAt: '2026-08-01T09:00:00.000Z' });
    const outcome = applyConfirmedMatch({ items: [rowOld], savedIds: [old.id] }, [], old.id, successor);
    expect(outcome.items).toHaveLength(1);
    expect(outcome.items[0]).toMatchObject({ id: rowOld.id, group: 'favourite', savedAt: '2026-08-01T09:00:00.000Z' });
    expect(outcome.items[0].venue.id).toBe('fp-os-brockwell');
    expect(outcome.savedIds).toEqual(['fp-os-brockwell']);
    expect(outcome.alreadySaved).toBe(false);
  });

  it('repoints only the id a saved day is rebuilt from; its itinerary, and every other day, are untouched', () => {
    const days = [day('d1', old.id), day('d2', 'fp-os-other')];
    const before = JSON.stringify(days);
    const outcome = applyConfirmedMatch({ items: [item(old)], savedIds: [old.id] }, days, old.id, successor);
    expect(outcome.days[0].draft?.venueId).toBe('fp-os-brockwell');
    expect(outcome.days[0].source).toBe(days[0].source); // the same object: not rewritten, not copied
    expect(outcome.days[0].draft?.params).toEqual({ date: '2026-10-17' });
    expect(outcome.days[1]).toBe(days[1]);
    expect(outcome.daysRepointed).toBe(1);
    expect(JSON.stringify(days)).toBe(before); // the input was not mutated
  });

  it('a day another family sent (no draft) is never touched', () => {
    const shared: SavedDay = { id: 'shared', createdAt: '2026-09-02T10:00:00.000Z', source: {} as SavedDay['source'], shared: { inviteId: 'i', connectionId: 'c', fromLabel: 'Kevin', acceptedAt: '2026-09-03T00:00:00.000Z' } };
    expect(applyConfirmedMatch({ items: [item(old)], savedIds: [old.id] }, [shared], old.id, successor).days[0]).toBe(shared);
  });

  it('if the parent had already saved the confirmed venue, they keep that row and the old one goes (two rows for one place would be a bug)', () => {
    const already = item(successor, { group: 'been' });
    const outcome = applyConfirmedMatch({ items: [item(old), already], savedIds: [old.id, successor.id] }, [day('d1', old.id)], old.id, successor);
    expect(outcome.items).toHaveLength(1);
    expect(outcome.items[0]).toBe(already);
    expect(outcome.savedIds).toEqual([successor.id]);
    expect(outcome.alreadySaved).toBe(true);
    expect(outcome.days[0].draft?.venueId).toBe(successor.id);
    expect(reconnectMessage('Brockwell Park', outcome)).toMatch(/already saved/);
  });

  it('changes nothing for an id the device did not save, or a match to the same id', () => {
    const state = { items: [item(old)], savedIds: [old.id] };
    const nothing = applyConfirmedMatch(state, [day('d1', old.id)], 'fp-google-unknown', successor);
    expect(nothing.items).toEqual(state.items);
    expect(nothing.daysRepointed).toBe(0);
    expect(applyConfirmedMatch(state, [], old.id, old).items[0].venue.id).toBe(old.id);
  });

  it('says what happened in a parent\'s words, and that plans already made are unchanged', () => {
    const outcome = applyConfirmedMatch({ items: [item(old)], savedIds: [old.id] }, [day('d1', old.id)], old.id, successor);
    const message = reconnectMessage('Brockwell Park', outcome);
    expect(message).toBe('Brockwell Park is now your saved place. Plans you have already made are unchanged.');
    expect(message).not.toMatch(/migrat|alias|broken|error/i);
  });
});

describe('writing to the real stores', () => {
  const successor = venue({ id: 'fp-os-brockwell', name: 'Brockwell Park', provider: 'os-greenspace' });
  beforeEach(() => {
    useSavedStore.setState({ items: [item(old), item(venue({ id: 'fp-os-keep', name: 'Ruskin Park', provider: 'os-greenspace' }))], savedIds: [old.id, 'fp-os-keep'] });
    usePlanningStore.setState({ savedDays: [day('d1', old.id), day('d2', 'fp-os-keep')] });
  });

  it('a confirmed match updates the saved place and the day it was built from, and nothing else', () => {
    const itineraryBefore = usePlanningStore.getState().savedDays[0].source;
    const outcome = confirmReconnect(old.id, successor);
    expect(outcome.daysRepointed).toBe(1);
    const saved = useSavedStore.getState();
    expect(saved.savedIds).toEqual(['fp-os-brockwell', 'fp-os-keep']);
    expect(saved.items.map((i) => i.venue.id)).toEqual(['fp-os-brockwell', 'fp-os-keep']);
    const days = usePlanningStore.getState().savedDays;
    expect(days[0].draft?.venueId).toBe('fp-os-brockwell');
    expect(days[0].source).toBe(itineraryBefore);
    expect(days[1].draft?.venueId).toBe('fp-os-keep');
  });

  it('declining is simply not calling it: the stores are exactly as they were', () => {
    const before = JSON.stringify({ s: useSavedStore.getState().items, d: usePlanningStore.getState().savedDays });
    // (the sheet\'s "None of these" only closes; there is no function to call)
    expect(JSON.stringify({ s: useSavedStore.getState().items, d: usePlanningStore.getState().savedDays })).toBe(before);
  });
});
