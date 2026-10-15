import { describe, expect, it } from 'vitest';

import { MAX_METRES, nameScore, needsReconnect, proposeCandidates, reconnectDays, reconnectIds, reconnectSaved, refOf } from '@/src/services/saved/reconnect';
import type { SavedDay } from '@/src/stores/planning-store';
import type { SavedItem, Venue } from '@/src/types';

const venue = (over: Partial<Venue> & { id: string; name: string }): Venue => ({
  category: 'park', latitude: 51.5, longitude: -0.1, driveMinutes: 10, imageUrl: '', familyScore: { score: 70 } as Venue['familyScore'], ...over,
}) as Venue;

describe('which saved places need reconnecting', () => {
  it('flags an id the catalogue no longer serves, and only that', () => {
    const served = new Set(['fp-os-1', 'fp-wd-q2']);
    expect(needsReconnect('fp-google-ChIJold', served)).toBe(true);
    expect(needsReconnect('fp-os-1', served)).toBe(false);
  });
});

describe('proposing, never choosing', () => {
  const saved = refOf(venue({ id: 'fp-google-ChIJold', name: 'Brockwell Park', latitude: 51.451, longitude: -0.1066 }));

  it('proposes the same place listed again, with why', () => {
    const catalogue = [venue({ id: 'fp-os-brockwell', name: 'Brockwell Park', latitude: 51.4512, longitude: -0.1068 }), venue({ id: 'fp-os-other', name: 'Ruskin Park', latitude: 51.466, longitude: -0.093 })];
    const { proposals, ambiguous } = proposeCandidates(saved, catalogue);
    expect(proposals.map((p) => p.venue.id)).toEqual(['fp-os-brockwell']);
    expect(proposals[0].reasons).toContain('same name');
    expect(ambiguous).toBe(false);
  });

  it('proposes nothing for a place that is far away, even with the same name', () => {
    const away = venue({ id: 'fp-os-far', name: 'Brockwell Park', latitude: 51.451 + (MAX_METRES + 200) / 111320, longitude: -0.1066 });
    expect(proposeCandidates(saved, [away]).proposals).toHaveLength(0);
  });

  it('proposes nothing for a different kind of place, and nothing for a name that only shares a word', () => {
    const close = { latitude: 51.4511, longitude: -0.1067 };
    expect(proposeCandidates(saved, [venue({ id: 'fp-wd-farm', name: 'Brockwell Park', category: 'farm', ...close })]).proposals).toHaveLength(0);
    expect(proposeCandidates(saved, [venue({ id: 'fp-os-x', name: 'Brockwell Lido', ...close })]).proposals).toHaveLength(0);
    expect(proposeCandidates(saved, [venue({ id: 'fp-os-y', name: 'Park Road Gardens', ...close })]).proposals).toHaveLength(0);
  });

  it('allows a house filed as a museum and an aquarium filed as a zoo to be the same place', () => {
    const ref = refOf(venue({ id: 'fp-google-ChIJq', name: "Queen's House", category: 'museum', latitude: 51.4812, longitude: -0.0038 }));
    const hit = venue({ id: 'fp-wd-q564981', name: "Queen's House", category: 'attraction', latitude: 51.4812, longitude: -0.00378 });
    expect(proposeCandidates(ref, [hit]).proposals.map((p) => p.venue.id)).toEqual(['fp-wd-q564981']);
  });

  it('shows both when two places are alike, says so, and never picks one', () => {
    const catalogue = [
      venue({ id: 'fp-os-a', name: 'Victoria Park', latitude: 51.5362, longitude: -0.0397 }),
      venue({ id: 'fp-os-b', name: 'Victoria Park Gardens', latitude: 51.5364, longitude: -0.0399 }),
    ];
    const ref = refOf(venue({ id: 'fp-google-ChIJv', name: 'Victoria Park', latitude: 51.5363, longitude: -0.0398 }));
    const result = proposeCandidates(ref, catalogue);
    expect(result.proposals.map((p) => p.venue.id)).toEqual(['fp-os-a', 'fp-os-b']);
    expect(result.ambiguous).toBe(true);
  });

  it('offers at most three', () => {
    const catalogue = Array.from({ length: 6 }, (_, i) => venue({ id: `fp-os-${i}`, name: 'Hilly Fields', latitude: 51.4611 + i * 0.00001, longitude: -0.0307 }));
    expect(proposeCandidates(refOf(venue({ id: 'fp-google-ChIJh', name: 'Hilly Fields', latitude: 51.4611, longitude: -0.0307 })), catalogue).proposals).toHaveLength(3);
  });

  it('scores a name on the words it shares, and does not let one shared word make a match', () => {
    expect(nameScore('Brockwell Park', 'brockwell park')).toBeCloseTo(1);
    expect(nameScore('The Horniman Museum and Gardens', 'Horniman Museum')).toBeGreaterThan(0.6);
    expect(nameScore('Victoria Park', 'Battersea Park')).toBeLessThan(0.6);
  });
});

describe('what reconnecting changes, and what it leaves', () => {
  const oldVenue = venue({ id: 'fp-google-ChIJold', name: 'Brockwell Park' });
  const newVenue = venue({ id: 'fp-os-brockwell', name: 'Brockwell Park' });
  const items: SavedItem[] = [
    { id: 'saved-fp-google-ChIJold', type: 'place', venue: oldVenue, group: 'favourite', savedAt: '2026-09-01T10:00:00Z' },
    { id: 'saved-other', type: 'place', venue: venue({ id: 'other', name: 'Other' }), group: 'want', savedAt: '2026-09-02T10:00:00Z' },
  ];

  it('points the saved row at the confirmed venue and keeps its group, time and own id', () => {
    const out = reconnectSaved(items, 'fp-google-ChIJold', newVenue);
    expect(out[0]).toMatchObject({ id: 'saved-fp-google-ChIJold', group: 'favourite', savedAt: '2026-09-01T10:00:00Z' });
    expect(out[0].venue.id).toBe('fp-os-brockwell');
    expect(out[1]).toBe(items[1]);
  });

  it('replaces the saved ids in place and never duplicates one', () => {
    expect(reconnectIds(['a', 'fp-google-ChIJold', 'b'], 'fp-google-ChIJold', 'fp-os-brockwell')).toEqual(['a', 'fp-os-brockwell', 'b']);
    expect(reconnectIds(['fp-os-brockwell', 'fp-google-ChIJold'], 'fp-google-ChIJold', 'fp-os-brockwell')).toEqual(['fp-os-brockwell']);
  });

  it('repoints a saved day\'s draft and leaves the itinerary it already made untouched', () => {
    const source = { title: 'A day at Brockwell Park', stops: ['kept exactly'] } as unknown as SavedDay['source'];
    const days = [
      { id: 'd1', createdAt: '2026-09-03', source, draft: { venueId: 'fp-google-ChIJold', params: { date: '2026-10-17' } } },
      { id: 'd2', createdAt: '2026-09-04', source, draft: { venueId: 'someone-else', params: {} } },
      { id: 'd3', createdAt: '2026-09-05', source },
    ] as SavedDay[];
    const out = reconnectDays(days, 'fp-google-ChIJold', 'fp-os-brockwell');
    expect(out[0].draft).toEqual({ venueId: 'fp-os-brockwell', params: { date: '2026-10-17' } });
    expect(out[0].source).toBe(source);
    expect(out[1]).toBe(days[1]);
    expect(out[2]).toBe(days[2]);
  });
});
