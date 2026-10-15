import { describe, expect, it } from 'vitest';

import { Venue, VenueCategory } from '@/src/types';
import { environmentOf } from '@/src/utils/venue-taxonomy';
import { classify, EXPLORE_GROUPS, groupOf, REVIEWED_PLACES } from '@/src/utils/venue-classification';

const venue = (id: string, name: string, category: VenueCategory, extra: Partial<Venue> = {}): Venue =>
  ({ id, name, category, latitude: 51.5, longitude: -0.1, driveMinutes: 20, imageUrl: '', familyScore: { score: 70, factors: {} as never, explanation: [] }, ...extra }) as Venue;

const FLIP_OUT_CANARY = venue('fp-google-ChIJ2fFKeuMDdkgRLHMNKVOxX_s', 'Flip Out Canary Wharf', 'soft_play');
const FLIP_OUT_BRENT = venue('fp-google-ChIJb5wm6eQQdkgR-qbm_aXw0xw', 'Flip Out Brent Cross', 'soft_play');
const BABYLON = venue('fp-google-ChIJ7_PV980bdkgROekbwOVWVfo', 'Babylon Park London', 'soft_play');
const AIRHOP = venue('fp-google-ChIJbe-XLh0fdkgRnjEVL2_qP3E', 'AirHop Adventure & Trampoline Park Enfield', 'soft_play');

describe('the five Explore groups', () => {
  it('are the approved five, in the approved wording', () => {
    expect(EXPLORE_GROUPS.map((g) => g.label)).toEqual([
      'Parks & playgrounds', 'Museums & galleries', 'Farms & animals', 'Soft play & trampolines', 'Attractions & activities',
    ]);
  });

  it('place every stored category in one group, and food in none', () => {
    const groupFor = (category: VenueCategory) => groupOf(venue(`x-${category}`, 'A place', category));
    expect(groupFor('park')).toBe('parks');
    expect(groupFor('beach')).toBe('parks');
    expect(groupFor('museum')).toBe('museums');
    expect(groupFor('farm')).toBe('animals');
    expect(groupFor('zoo')).toBe('animals');
    expect(groupFor('soft_play')).toBe('play');
    expect(groupFor('attraction')).toBe('attractions');
    expect(groupFor('activity')).toBe('attractions');
    expect(groupFor('restaurant')).toBeNull();
    expect(groupFor('cafe')).toBeNull();
  });
});

describe('soft play is told apart from trampoline parks', () => {
  it('says Flip Out Canary Wharf has soft play and no trampolines, from its own page', () => {
    const c = classify(FLIP_OUT_CANARY);
    expect(c.group).toBe('play');
    expect(c.play).toEqual({ softPlay: 'confirmed', trampolines: 'no' });
    expect(c.basis).toBe('reviewed');
    expect(c.evidence.join(' ')).toMatch(/does not|No trampolines/i);
  });

  it('does not treat a brand as an answer: the same chain has trampolines elsewhere', () => {
    expect(classify(FLIP_OUT_BRENT).play).toEqual({ softPlay: 'confirmed', trampolines: 'confirmed' });
    expect(classify(FLIP_OUT_CANARY).play?.trampolines).toBe('no');
  });

  it('calls a trampoline park with no evidence of soft play "not confirmed", never "none" and never "confirmed"', () => {
    expect(classify(AIRHOP).play).toEqual({ softPlay: 'not_confirmed', trampolines: 'confirmed' });
    expect(classify(BABYLON).play?.trampolines).toBe('not_confirmed');
  });

  it('classifies an unreviewed soft play venue from its name alone, and never calls an unnamed one soft play', () => {
    const play = (name: string) => classify(venue(`unreviewed-${name}`, name, 'soft_play'));
    expect(play('Jungle Jam Trampoline Park').label).toBe('Trampoline park');
    expect(play('Little Tots Soft Play').play).toEqual({ softPlay: 'confirmed', trampolines: 'not_confirmed' });
    const unknown = play('Kettleford Play House');
    expect(unknown.label).toBe('Indoor play, soft play not confirmed');
    expect(unknown.play?.softPlay).toBe('not_confirmed');
    expect(unknown.basis).toBe('name');
  });
});

describe('the corrections ledger, as Explore applies it', () => {
  it('moves a museum filed as an attraction, and a nature reserve and a sports park filed as attractions and activities', () => {
    expect(groupOf(venue('fp-google-ChIJq4lX1doEdkgR5JXPstgQjc0', 'Churchill War Rooms', 'attraction'))).toBe('museums');
    expect(groupOf(venue('fp-google-ChIJgUtOcjEcdkgR6Y_NLIc0XBQ', 'Walthamstow Wetlands', 'attraction'))).toBe('parks');
    expect(groupOf(venue('fp-google-ChIJYXZohAkQdkgRfyZIWSl03SM', 'Paddington Recreation Ground', 'activity'))).toBe('parks');
  });

  it('hides what is not a separate destination, without touching the stored category', () => {
    const hogwarts = venue('fp-google-ChIJjXVQ6QNBdkgRUpu1zpMlFSs', 'Hogwarts Castle', 'attraction');
    expect(classify(hogwarts).hidden).toBe(true);
    expect(groupOf(hogwarts)).toBeNull();
    expect(hogwarts.category).toBe('attraction');
  });

  it('keeps a moved place usual for its new group, never confirmed', () => {
    const wetlands = venue('fp-google-ChIJgUtOcjEcdkgR6Y_NLIc0XBQ', 'Walthamstow Wetlands', 'attraction');
    expect(environmentOf(wetlands)).toEqual({ environment: 'outdoor', confirmed: false });
  });

  it('gives every reviewed entry something to say', () => {
    for (const [id, entry] of Object.entries(REVIEWED_PLACES)) {
      expect(id.startsWith('fp-google-'), id).toBe(true);
      expect(Boolean(entry.group || entry.hidden), id).toBe(true);
    }
  });
});
