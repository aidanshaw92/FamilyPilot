import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { rankForFamily } from '@/src/services/places/home-list';
import { mergePlaceToVenue } from '@/src/services/places/merge-place';
import { matchCardReason } from '@/src/services/matching/family-match';
import type { FamilyProfile, Venue } from '@/src/types';
import type { ExternalPlaceRecord, VenueFamilyMetadata } from '@/src/types/places';

/**
 * Browse first, plan second.
 *
 * Before a plan exists, Home, Explore and Venue Detail answer "is this a good place for our family?" from what is stable
 * about the family. They used to answer "can we leave now?": a nap or feed due soon put "Leave by 10:47 to be home in
 * time for Ozzie's feed" at the top of every card, and a routine factor (a tenth of the score) reordered Home through the
 * morning. Naps and feeds now belong to the planner, once a date and a time have been chosen.
 *
 * Driven through Home's real ranking (`rankForFamily`, which runs the same personalisation as Explore, Halfway and Venue
 * Detail) for the family from the real-device recording: two children, a feed and two naps.
 */

const FAMILY = {
  id: 'f', parentName: 'Aidan',
  members: [
    { id: 'p1', name: 'Aidan', role: 'parent', dateOfBirth: '1990-03-15', age: 36 },
    { id: 'c1', name: 'Sloane', role: 'child', dateOfBirth: '2023-03-01', age: 3, dobKnown: true, mobility: ['walks'] },
    { id: 'c2', name: 'Ozzie', role: 'child', dateOfBirth: '2026-02-01', age: 0, ageMonths: 8, dobKnown: true, mobility: ['buggy', 'carrier'] },
  ],
  homeLocation: 'Mill Hill', homeLatitude: 51.615, homeLongitude: -0.245, budgetTier: 'moderate', maxDriveMinutes: 45,
  completionPercent: 90, memberships: [], mustHaveFacilities: [],
  routines: [
    { id: 'r1', label: '', kind: 'feed', time: '11:00', durationMinutes: 30, atHome: false, childId: 'c2' },
    { id: 'r2', label: '', kind: 'nap', time: '13:00', durationMinutes: 90, atHome: true, childId: 'c2' },
    { id: 'r3', label: '', kind: 'nap', time: '13:30', durationMinutes: 60, atHome: true, childId: 'c1' },
  ],
} as unknown as FamilyProfile;
const NO_ROUTINES = { ...FAMILY, routines: [] } as FamilyProfile;

const OPEN_9_TO_5 = {
  weekdayText: ['Monday to Sunday: 09:00 to 17:00'],
  periods: Array.from({ length: 7 }, (_, day) => ({ open: { day, hour: 9, minute: 0 }, close: { day, hour: 17, minute: 0 } })),
  timeZone: 'Europe/London',
};

const place = (n: number, name: string, category: string, lat: number, lng: number, metadata: Partial<VenueFamilyMetadata> | null) => {
  const id = `fp-test-${n}`;
  const record = {
    familypilotId: id, externalId: `test:${n}`, provider: 'google', name, latitude: lat, longitude: lng, category,
    address: '', photos: [], openingHours: OPEN_9_TO_5, isOpen: true, fetchedAt: new Date().toISOString(),
    enrichmentStatus: metadata ? 'enriched' : 'provider_only',
  } as unknown as ExternalPlaceRecord;
  const meta = metadata
    ? ({ familypilotPlaceId: id, enrichmentStatus: 'enriched', provenance: {}, goodToKnow: [], facilities: [], ...metadata } as VenueFamilyMetadata)
    : null;
  return { record, meta };
};

/** A spread a parent meets: confirmed for both children, partial, a reviewed negative, an unreviewed park, near and far. */
const PLACES = [
  place(1, 'Kettleford Play House', 'soft_play', 51.56, -0.29, {
    minRecommendedAge: 0, maxRecommendedAge: 8, pushchairSuitability: 'good',
    familyFacilities: { toilets: 'yes', babyChanging: 'yes', parking: 'yes' }, facilities: ['toilets', 'baby_changing', 'parking'],
  }),
  place(2, 'Marlow End Farm', 'farm', 51.66, -0.12, {
    minRecommendedAge: 1, maxRecommendedAge: 8, pushchairSuitability: 'good',
    familyFacilities: { toilets: 'yes', babyChanging: 'yes', parking: 'yes' }, facilities: ['toilets', 'baby_changing', 'parking'],
  }),
  place(3, 'Hollybank Gardens', 'park', 51.58, -0.18, { familyFacilities: { toilets: 'yes' }, facilities: ['toilets'] }),
  place(4, 'Nettlefold Tower', 'attraction', 51.52, -0.1, {
    minRecommendedAge: 0, maxRecommendedAge: 12, pushchairSuitability: 'difficult', extendedTerrain: 'hilly',
    familyFacilities: { toilets: 'yes', babyChanging: 'no', parking: 'yes' }, facilities: ['toilets', 'parking'],
  }),
  place(5, 'Larchmere Water Gardens', 'park', 51.6, -0.27, null),
];

const venues = (): Venue[] => PLACES.map(({ record, meta }) => mergePlaceToVenue(record, meta, FAMILY.homeLatitude!, FAMILY.homeLongitude!));

/** Everything a parent reads about a place before planning, per place, in Home's order. */
function browse(profile: FamilyProfile, clock: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`2026-10-07T${clock}:00+01:00`));
  try {
    return rankForFamily(venues(), profile, null).map((v) => ({
      name: v.name,
      score: v.familyScore.score,
      card: v.familyMatch ? matchCardReason(v.familyMatch) : '',
      headline: v.familyMatch?.headline ?? '',
      verdict: v.familyMatch?.verdict,
      lines: [...(v.familyMatch?.reasons ?? []), ...(v.familyMatch?.cautions ?? []), ...(v.familyMatch?.toCheck ?? [])].map((l) => l.text),
      why: v.familyScore.explanation,
      cautions: v.familyScore.cautions ?? [],
    }));
  } finally {
    vi.useRealTimers();
  }
}

const TIMING = /leave by|in time for|nap|feed|routine|run into/i;

afterEach(() => vi.useRealTimers());

describe('before a plan: about the family, never about leaving now', () => {
  it('the same order and scores at any time of day', () => {
    const rank = (clock: string) => browse(FAMILY, clock).map((v) => [v.name, v.score]);
    for (const clock of ['09:30', '10:45', '12:30', '15:00', '16:30']) expect(rank(clock), clock).toEqual(rank('08:30'));
  });

  it('the same words at any time it is open; only the opening state, a fact about the place, follows the clock', () => {
    const at = browse(FAMILY, '09:30');
    for (const clock of ['10:45', '12:30', '15:00']) expect(browse(FAMILY, clock), clock).toEqual(at);
    const early = browse(FAMILY, '08:30');
    expect(early.map((v) => v.lines.filter((l) => !/^Opens at|^Open until/.test(l)))).toEqual(at.map((v) => v.lines.filter((l) => !/^Opens at|^Open until/.test(l))));
  });

  it('naps and feeds change nothing while browsing: the same as a family with no routines', () => {
    expect(browse(FAMILY, '10:45')).toEqual(browse(NO_ROUTINES, '10:45'));
  });

  it('no card, headline, reason, caution or explanation mentions a nap, a feed or a time to leave', () => {
    for (const clock of ['09:30', '10:45', '12:30']) {
      for (const v of browse(FAMILY, clock)) {
        expect([v.card, v.headline, ...v.lines, ...v.why, ...v.cautions].join(' | '), `${v.name} at ${clock}`).not.toMatch(TIMING);
      }
    }
  });

  it('a headline is a judgement about the family, never "today" unless the place is shut today', () => {
    for (const v of browse(FAMILY, '10:45')) expect(v.headline, v.name).not.toMatch(/today/);
  });
});

describe('stable family personalisation still decides the order and the words', () => {
  it('leads each card with what is confirmed about a particular child', () => {
    const kettleford = browse(FAMILY, '10:45').find((v) => v.name === 'Kettleford Play House')!;
    expect(kettleford.card).toMatch(/^Good for Sloane and Ozzie’s age|^Good for Sloane|Ozzie/);
    expect(kettleford.lines).toContain('Good buggy access for Ozzie’s buggy');
  });

  it('a place confirmed for both children ranks above one with a reviewed problem for Ozzie’s buggy', () => {
    const order = browse(FAMILY, '10:45').map((v) => v.name);
    expect(order.indexOf('Kettleford Play House')).toBeLessThan(order.indexOf('Nettlefold Tower'));
  });

  it('a reviewed problem is still said, about the child it is about', () => {
    const tower = browse(FAMILY, '10:45').find((v) => v.name === 'Nettlefold Tower')!;
    expect(tower.lines.join(' | ')).toMatch(/Buggy access is difficult here|sling or carrier may be easier for Ozzie/);
  });

  it('no child suitability from a category alone: a park nobody has reviewed says nothing about Sloane or Ozzie', () => {
    const park = browse(FAMILY, '10:45').find((v) => v.name === 'Larchmere Water Gardens')!;
    expect(park.verdict).toBe('not_reviewed');
    expect([...park.lines.filter((l) => !/still to be checked/.test(l)), ...park.why].join(' | ')).not.toMatch(/Sloane|Ozzie|great age|good for/i);
  });
});

describe('the routine lens and helper are gone from browsing', () => {
  const root = join(__dirname, '..', '..');
  it('Home has no "Fits your day" chip, and nothing outside the planner computes a leave-by time', () => {
    expect(readFileSync(join(root, 'src/utils/venue-taxonomy.ts'), 'utf8')).not.toMatch(/label: 'Fits your day'/);
    for (const file of ['src/services/matching/family-match.ts', 'src/services/scoring/family-score.ts', 'src/utils/personalise-venues.ts', 'src/services/scoring/restaurant-score.ts', 'src/services/matching/match-explanations.ts']) {
      const code = readFileSync(join(root, file), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(code, file).not.toMatch(/evaluateRoutineFit|routineFit|resolveRoutines/);
    }
  });
});
