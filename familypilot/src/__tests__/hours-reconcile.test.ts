import { describe, expect, it } from 'vitest';

import { OFFICIAL_MAX_AGE_DAYS, reconcileHours } from '@/src/services/places/hours-reconcile';
import { isOpenOn } from '@/src/utils/opening-hours';
import type { OpeningHoursSchedule } from '@/src/types/opening-hours';
import type { OfficialHoursRule } from '@/src/types/official-hours';

const daily = (openH: number, openM: number, closeH: number, closeM: number, skip: number[] = []): OpeningHoursSchedule => ({
  timezone: 'Europe/London',
  periods: [0, 1, 2, 3, 4, 5, 6].filter((d) => !skip.includes(d)).map((d) => ({ open: { day: d, hour: openH, minute: openM }, close: { day: d, hour: closeH, minute: closeM } })),
});
const ALL = [0, 1, 2, 3, 4, 5, 6];
const rule = (over: Partial<OfficialHoursRule>): OfficialHoursRule => ({
  id: 'r', scope: 'venue', days: ALL, open: '10:00', close: '17:00', checkedAt: '2026-10-08', sourceUrl: 'https://example.org/visit', ...over,
});
const ASOF = '2026-10-09';

describe('which hours to believe', () => {
  it('says nothing when the two sources agree, even if they are written differently', () => {
    const r = reconcileHours(daily(10, 0, 17, 0), [rule({ open: '10:00', close: '17:00' })], '2026-10-10', ASOF);
    expect(r).toMatchObject({ agreement: 'agree', basis: 'provider', note: null });
    // Ten minutes apart is the same hours.
    expect(reconcileHours(daily(10, 0, 17, 0), [rule({ open: '10:05', close: '16:55' })], '2026-10-10', ASOF).agreement).toBe('agree');
  });

  it('London Zoo: Google says 5pm all year, the zoo says 4pm from 24 October. Before that date they agree; from it the zoo’s hours are used and the parent is told', () => {
    const official = [
      rule({ id: 'summer', until: '2026-10-23', close: '17:00' }),
      rule({ id: 'winter', from: '2026-10-24', until: '2027-02-12', close: '16:00', lastEntry: '15:00' }),
    ];
    const provider = daily(10, 0, 17, 0);
    expect(reconcileHours(provider, official, '2026-10-23', ASOF)).toMatchObject({ agreement: 'agree', note: null });
    const winter = reconcileHours(provider, official, '2026-10-25', ASOF);
    expect(winter.agreement).toBe('conflict');
    expect(winter.note?.text).toBe('Opening hours differ between sources on Sunday: Google lists 10am to 5pm; the venue’s website says 10am to 4pm. We’ve used the venue’s website. Check before you go.');
    // The planner now refuses a visit that runs to 4:30pm, which the provider’s hours would have allowed.
    expect(isOpenOn('2026-10-25', '13:00', '16:30', provider).status).toBe('open');
    expect(isOpenOn('2026-10-25', '13:00', '16:30', winter.schedule).status).toBe('closed');
  });

  it('Mudchute: Google says closed on Mondays, the farm says open every day. The day is not lost, and the disagreement is named', () => {
    const provider = daily(9, 0, 16, 0, [1]);
    const r = reconcileHours(provider, [rule({ open: '09:00', close: '16:00' })], '2026-10-12', ASOF); // a Monday
    expect(r.agreement).toBe('conflict');
    expect(r.note?.text).toContain('Google lists closed');
    expect(isOpenOn('2026-10-12', '10:00', '12:00', provider).status).toBe('closed');
    expect(isOpenOn('2026-10-12', '10:00', '12:00', r.schedule).status).toBe('open');
    // Tuesday they agree.
    expect(reconcileHours(provider, [rule({ open: '09:00', close: '16:00' })], '2026-10-13', ASOF).note).toBeNull();
  });

  it('Gunnersbury: Google says open 24 hours, the park says 7am until dusk. Told, but nothing is scheduled against "dusk"', () => {
    const provider: OpeningHoursSchedule = { timezone: 'Europe/London', periods: [{ open: { day: 0, hour: 0, minute: 0 } }] };
    const r = reconcileHours(provider, [rule({ open: '07:00', close: null, closeText: 'dusk' })], '2026-10-10', ASOF);
    expect(r.agreement).toBe('not-comparable');
    expect(r.basis).toBe('provider');
    expect(r.schedule).toBe(provider);
    expect(r.note?.text).toBe('Opening hours differ between sources: Google lists this place as open 24 hours; the venue’s website says 7am until dusk. Check before you go.');
  });

  it('a part of the venue never speaks for the venue', () => {
    const museum = rule({ scope: 'area', area: 'Museum', days: [2, 3, 4, 5, 6, 0], open: '10:00', close: '16:30' });
    expect(reconcileHours(daily(0, 0, 23, 59), [museum], '2026-10-10', ASOF)).toMatchObject({ agreement: 'provider-only', note: null });
  });

  it('ignores a reading that is too old rather than trusting it', () => {
    const old = rule({ checkedAt: '2026-07-01', close: '16:00' });
    expect(OFFICIAL_MAX_AGE_DAYS).toBe(45);
    expect(reconcileHours(daily(10, 0, 17, 0), [old], '2026-10-10', ASOF)).toMatchObject({ agreement: 'provider-only', note: null });
  });

  it('uses the venue’s hours when the provider has none, and has nothing to disagree with', () => {
    const r = reconcileHours(undefined, [rule({ open: '10:00', close: '17:00' })], '2026-10-10', ASOF);
    expect(r).toMatchObject({ agreement: 'official-only', basis: 'official', note: null });
    expect(isOpenOn('2026-10-10', '11:00', '12:00', r.schedule).status).toBe('open');
  });

  it('keeps unknown unknown: no readings and no provider hours is nothing, not closed', () => {
    expect(reconcileHours(undefined, undefined, '2026-10-10', ASOF)).toMatchObject({ schedule: undefined, agreement: 'none', basis: 'none' });
  });

  it('keeps the provider’s hours for days the venue says nothing about', () => {
    const provider = daily(10, 0, 17, 0);
    const weekdaysOnly = [rule({ days: [1, 2, 3, 4, 5], open: '09:00', close: '18:00' })];
    const r = reconcileHours(provider, weekdaysOnly, '2026-10-12', ASOF); // Monday: conflict
    expect(r.agreement).toBe('conflict');
    expect(isOpenOn('2026-10-17', '10:30', '16:30', r.schedule).status).toBe('open'); // Saturday: the provider's hours
  });
});

// ---- The planner and the cards use the reconciled hours --------------------------------------------------------------------
import { createPlan } from '@/src/services/planning/create-plan';
import { homeKey, stopKey } from '@/src/services/planning/sequencer';
import type { PlanDraft } from '@/src/services/planning/plan-draft';
import { evaluateFamilyMatch } from '@/src/services/matching/family-match';
import type { FamilyMember, FamilyProfile, Venue } from '@/src/types';
import type { MatchableVenueFacts } from '@/src/types/day-request';

const facts = (officialHours?: OfficialHoursRule[]): MatchableVenueFacts => ({
  placeId: 'fp-zoo', name: 'London Zoo', category: 'zoo', driveMinutes: 20, enrichmentStatus: 'verified', minRecommendedAge: null, maxRecommendedAge: null,
  venueAgePolicy: null, toilets: 'yes', babyChanging: 'yes', parking: 'unknown', pushchairSuitability: 'good', environment: 'outdoor', energyLevel: 'moderate',
  visitDurationMinutes: 180, estimatedSpend: null, goodToKnow: [], warnings: [], openingStatus: 'unknown', ...(officialHours ? { officialHours } : {}),
});
const ZOO_OFFICIAL: OfficialHoursRule[] = [
  rule({ id: 'summer', until: '2026-10-23', close: '17:00' }),
  rule({ id: 'winter', from: '2026-10-24', until: '2027-02-12', close: '16:00', lastEntry: '15:00' }),
];
const matrix = (async () => ({
  matrix: { legs: { [homeKey('mine')]: { [stopKey('fp-zoo')]: { minutes: 20, source: 'estimated' } }, [stopKey('fp-zoo')]: { [homeKey('mine')]: { minutes: 20, source: 'estimated' } } } },
  provenance: { live: 0, estimated: 2 }, trafficDowngraded: false, missing: [],
})) as never;
const zoo = (official?: OfficialHoursRule[]) => ({
  placeId: 'fp-zoo', name: 'London Zoo', category: 'zoo' as const, latitude: 51.53, longitude: -0.15, openingHours: daily(10, 0, 17, 0), facts: facts(official),
});
const party = { id: 'mine', label: 'Our family', area: 'Camden', latitude: 51.54, longitude: -0.14, ages: [4], maxDriveMinutes: 60, pushchair: false, required: [], routines: [] } as never;
const draft = (date: string, startAt: string, visit: number): PlanDraft => ({ date, startAt, partyIds: ['mine'], attendeeIds: null, visit, returnBy: '', bufferMinutes: 15, environment: 'either' });
const deps = { buildMatrix: matrix, now: new Date('2026-10-09T08:00:00') };

describe('London Zoo, planned with and without its own hours', () => {
  it('before 24 October the provider’s 5pm is right: the plan builds with no note about hours', async () => {
    const out = await createPlan({ venue: zoo(ZOO_OFFICIAL) as never, draft: draft('2026-10-17', '13:00', 210), families: [party] }, deps);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.view.needsChecking.join(' ')).not.toContain('Opening hours differ');
  });

  it('from 24 October a 13:00 to 16:30 visit, which Google’s hours would allow, is refused because the zoo closes at 4pm', async () => {
    const withGoogleOnly = await createPlan({ venue: zoo() as never, draft: draft('2026-10-25', '13:00', 210), families: [party] }, deps);
    expect(withGoogleOnly.ok).toBe(true); // what happens today
    const withOwnHours = await createPlan({ venue: zoo(ZOO_OFFICIAL) as never, draft: draft('2026-10-25', '13:00', 210), families: [party] }, deps);
    expect(withOwnHours.ok).toBe(false);
    if (!withOwnHours.ok) expect(withOwnHours.title).toBe('The visit would run past closing');
  });

  it('a visit that fits is built, and the plan says which hours it used and what the other source said', async () => {
    const out = await createPlan({ venue: zoo(ZOO_OFFICIAL) as never, draft: draft('2026-10-25', '10:30', 150), families: [party] }, deps);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.view.needsChecking.join(' ')).toContain('Google lists 10am to 5pm; the venue’s website says 10am to 4pm');
    // And the note survives into the saved plan source.
    expect(JSON.stringify(out.source)).toContain('Opening hours differ between sources');
  });

  it('does not mutate the venue it was given', async () => {
    const venue = zoo(ZOO_OFFICIAL);
    const before = JSON.stringify(venue.openingHours);
    await createPlan({ venue: venue as never, draft: draft('2026-10-25', '10:30', 150), families: [party] }, deps);
    expect(JSON.stringify(venue.openingHours)).toBe(before);
  });
});

describe('Home and Venue Detail use the same reconciled hours', () => {
  const adult: FamilyMember = { id: 'p', name: 'Alex', role: 'parent', dateOfBirth: '', age: 38 };
  const kid: FamilyMember = { id: 'c', name: 'Sloane', role: 'child', dateOfBirth: '', age: 4, dobKnown: true, ageMonths: null, mobility: ['walks'] };
  const profile = { id: 'f', parentName: 'Alex', members: [adult, kid], homeLocation: 'N1', budgetTier: 'moderate', maxDriveMinutes: 60, completionPercent: 100, mustHaveFacilities: [], routines: [] } as unknown as FamilyProfile;
  const mudchute = (official?: OfficialHoursRule[]): Venue => ({
    id: 'fp-m', name: 'Mudchute', category: 'farm', latitude: 51.49, longitude: -0.01, driveMinutes: 20, imageUrl: '', familyScore: { score: 80, factors: {} as never, explanation: [] },
    enrichmentStatus: 'enriched', structuredOpeningHours: daily(9, 0, 16, 0, [1]), facilities: [],
    trustedFacts: { ...facts(official), placeId: 'fp-m', name: 'Mudchute', category: 'farm' },
  } as unknown as Venue);
  const MONDAY = new Date(2026, 9, 12, 11, 0, 0);

  it('Mudchute on a Monday: Google says closed, the farm says open — the card no longer says Closed today', () => {
    const today = evaluateFamilyMatch({ venue: mudchute(), profile, score: 80, now: MONDAY });
    expect(today.availableToday).toBe(false); // today, without the venue's own hours
    const withOwn = evaluateFamilyMatch({ venue: mudchute([rule({ id: 'farm', open: '09:00', close: '16:00', checkedAt: '2026-10-08' })]), profile, score: 80, now: MONDAY });
    expect(withOwn.availableToday).toBe(true);
  });
});
