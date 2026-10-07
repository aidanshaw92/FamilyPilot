import { describe, expect, it } from 'vitest';

import { evaluateFamilyMatch, matchBadgeText, matchCardReason } from '@/src/services/matching/family-match';
import { FamilyMember, FamilyProfile, Venue } from '@/src/types';
import { MatchableVenueFacts } from '@/src/types/day-request';
import { OpeningHoursSchedule } from '@/src/types/opening-hours';

/**
 * FamilyPilot must never say a place works TODAY while saying it is closed today.
 *
 * Real-device run, RAF Museum: "Possible for your family today" above "Closed for today · opens tomorrow 10am". The cause
 * was that today's opening state fed the suitability verdict: a place already finished for the day became a soft caution
 * (so "Possible"), a place shut all day became a breach (so "Probably not … today", which also wrongly called it a poor
 * fit). The headline then said "today" whatever the clock said.
 *
 * The rule now: SUITABILITY (does this place work for this family?) and TODAY'S AVAILABILITY (can they go today?) are
 * separate. Being shut today never lowers the verdict, never removes the place, and never disables planning another
 * day; but nothing about a place shut today may be worded as a claim about today.
 */

// Tuesday 6 October 2026, 11:00 on the device; the venues are in London.
const NOW = new Date(2026, 9, 6, 11, 0, 0);
const TUESDAY = 2;

const child = (id: string, name: string, age: number, extra: Partial<FamilyMember> = {}): FamilyMember => ({
  id, name, role: 'child', dateOfBirth: '', age, dobKnown: true, ageMonths: age === 0 ? 8 : null, mobility: ['walks'], ...extra,
});
const PROFILE = {
  id: 'f', parentName: 'Aidan', members: [{ id: 'p', name: 'Aidan', role: 'parent', dateOfBirth: '', age: 38 }, child('c1', 'Sloane', 4)],
  homeLocation: 'NW7', budgetTier: 'moderate', maxDriveMinutes: 45, completionPercent: 100, mustHaveFacilities: [],
  // A nap whose timing would otherwise be advised on ("leave by…"): a claim about a visit today.
  routines: [{ id: 'r1', kind: 'nap', label: 'Nap', time: '13:00', durationMinutes: 90, childId: 'c1' }],
} as unknown as FamilyProfile;

const GOOD_FACTS: MatchableVenueFacts = {
  placeId: 'fp-raf', name: 'RAF Museum', category: 'museum', driveMinutes: 15, enrichmentStatus: 'enriched',
  minRecommendedAge: 2, maxRecommendedAge: 12, venueAgePolicy: null,
  toilets: 'yes', babyChanging: 'yes', parking: 'yes', pushchairSuitability: 'good',
  environment: 'indoor', energyLevel: 'moderate', visitDurationMinutes: 150, estimatedSpend: 'Free',
  goodToKnow: [], warnings: [], openingStatus: 'unknown',
};

const daily = (open: [number, number], close: [number, number], skip: number[] = []): OpeningHoursSchedule => ({
  timezone: 'Europe/London',
  periods: [0, 1, 2, 3, 4, 5, 6].filter((d) => !skip.includes(d)).map((d) => ({
    open: { day: d, hour: open[0], minute: open[1] },
    close: { day: d, hour: close[0], minute: close[1] },
  })),
});

/** The hour it is in London at NOW, so the schedules hold whatever timezone the machine running the tests is in. */
const LONDON_HOUR = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }).format(NOW));

const SCHEDULES: Record<string, { hours: OpeningHoursSchedule | undefined; state: string; available: boolean }> = {
  'open now': { hours: daily([LONDON_HOUR - 1, 0], [17, 0]), state: 'open_now', available: true },
  'opens later today': { hours: daily([LONDON_HOUR + 2, 0], [LONDON_HOUR + 5, 0]), state: 'opens_later', available: true },
  'closing soon': { hours: daily([LONDON_HOUR - 2, 0], [LONDON_HOUR, 40]), state: 'closing_soon', available: true },
  'already closed for today': { hours: daily([LONDON_HOUR - 4, 0], [LONDON_HOUR - 1, 0]), state: 'closed_for_today', available: false },
  'closed all day today': { hours: daily([10, 0], [16, 0], [TUESDAY]), state: 'closed_today', available: false },
  'hours unknown': { hours: undefined, state: 'unknown', available: true },
  'malformed hours': { hours: { timezone: 'Europe/London', periods: [{} as never, null as never] }, state: 'unknown', available: true },
};

const venue = (hours: OpeningHoursSchedule | undefined): Venue => ({
  id: 'fp-raf', name: 'RAF Museum', category: 'museum', latitude: 51.6, longitude: -0.24, driveMinutes: 15, imageUrl: '',
  familyScore: { score: 88, factors: {} as never, explanation: [] }, enrichmentStatus: 'enriched',
  structuredOpeningHours: hours, trustedFacts: GOOD_FACTS, facilities: [],
} as unknown as Venue);

const match = (hours: OpeningHoursSchedule | undefined) => evaluateFamilyMatch({ venue: venue(hours), profile: PROFILE, score: 88, now: NOW });

/** Every sentence a parent can read about the place, on the venue page and on a card. */
function everything(r: ReturnType<typeof match>): string[] {
  return [r.headline, matchBadgeText(r), matchCardReason(r), r.cardNote ?? '', ...r.reasons.map((l) => l.text), ...r.cautions.map((l) => l.text), ...r.toCheck.map((l) => l.text)];
}

/** "today" said as a claim that they can go, as opposed to "not today" / "Closed today" / "Closed for today". */
const CLAIMS_TODAY = /(?<!not |Closed |Closed for )\btoday\b/;

describe('every opening state: the right availability, and never a contradiction', () => {
  for (const [name, { hours, state, available }] of Object.entries(SCHEDULES)) {
    it(name, () => {
      const r = match(hours);
      expect(r.today.state).toBe(state);
      expect(r.availableToday).toBe(available);
      if (!available) {
        for (const line of everything(r)) expect(line, line).not.toMatch(CLAIMS_TODAY);
        expect(r.headline).toMatch(/, but not today$/);
        // The closed line is what a parent sees first about today, on the page and on the card.
        expect(r.cautions[0].text).toMatch(/^Closed (for )?today/);
        expect(matchCardReason(r)).toMatch(/Closed (for )?today/);
      }
    });
  }
});

describe('closed today is about today, not about whether the place suits the family', () => {
  it('the verdict is the same as on a day it is open', () => {
    const open = match(SCHEDULES['open now'].hours);
    const finished = match(SCHEDULES['already closed for today'].hours);
    const shut = match(SCHEDULES['closed all day today'].hours);
    expect(['good', 'excellent']).toContain(open.verdict);
    // Without the day's own positives (open today, a nap to time a visit around) the verdict may not rise; it never
    // falls to poor, and it is never "possible" merely because of the clock.
    for (const r of [finished, shut]) {
      expect(r.verdict).not.toBe('poor');
      expect(r.verdict).toBe(open.verdict);
    }
  });

  it('the RAF Museum case: a good place finished for the day reads "Good for Sloane, but not today" with when it opens', () => {
    const r = match(SCHEDULES['already closed for today'].hours);
    expect(r.headline).toMatch(/^(Good|Excellent) for Sloane, but not today$/);
    expect(r.cautions[0].text).toMatch(/^Closed for today · opens tomorrow \d+(am|pm)$/);
    expect(r.headline).not.toMatch(/Possible for your family today/);
  });

  it('a place shut all day says when it next opens, and is still not called a poor fit', () => {
    const r = match(SCHEDULES['closed all day today'].hours);
    expect(r.cautions[0].text).toBe('Closed today · opens tomorrow 10am');
    expect(r.headline).not.toMatch(/^Probably not/);
  });

  it('no "leave by … for the nap" or "good weather today" for a day they cannot go', () => {
    const r = match(SCHEDULES['already closed for today'].hours);
    expect(r.reasons.map((l) => l.key)).not.toContain('routine');
    expect(r.reasons.map((l) => l.key)).not.toContain('open-today');
    expect(r.cautions.map((l) => l.key)).not.toContain('routine-clash');
  });

  it('on a day it is open, today is still said plainly', () => {
    const r = match(SCHEDULES['open now'].hours);
    expect(r.headline).toMatch(/ today$/);
    expect(r.reasons.map((l) => l.key)).toContain('open-today');
  });

  it('a confirmed breach still makes it poor, and still never claims today when shut', () => {
    const shutAndTooFar = evaluateFamilyMatch({ venue: { ...venue(SCHEDULES['closed all day today'].hours), driveMinutes: 120 } as Venue, profile: PROFILE, score: 88, now: NOW });
    expect(shutAndTooFar.verdict).toBe('poor');
    expect(shutAndTooFar.headline).toBe('Probably not for your family');
  });

  it('a place never open to visitors is not a "today" question: it stays a breach', () => {
    const r = match({ timezone: 'Europe/London', periods: [] });
    expect(r.today.state).toBe('never_open');
    expect(r.verdict).toBe('poor');
    expect(r.availableToday).toBe(false);
  });
});

describe('shut today never stops planning another day', () => {
  // Imported here so the suite above stays about Family Fit alone.
  it('the plan sheet opens on the day the venue next opens, at the usual start', async () => {
    const { planDraftDefaults } = await import('@/src/services/planning/plan-draft');
    const { describeOpeningToday } = await import('@/src/utils/opening-today');
    const shut = describeOpeningToday(SCHEDULES['closed all day today'].hours, NOW);
    expect(shut.opensAgainInDays).toBe(1);
    const d = planDraftDefaults({ profile: PROFILE, today: '2026-10-06', nowTime: '11:00', opensAgainInDays: shut.opensAgainInDays });
    expect(d.draft.date).toBe('2026-10-07');
    // Open today: today stays today.
    expect(planDraftDefaults({ profile: PROFILE, today: '2026-10-06', nowTime: '08:00', opensAgainInDays: null }).draft.date).toBe('2026-10-06');
    // A later date the parent chose is never moved.
    expect(planDraftDefaults({ profile: PROFILE, today: '2026-10-06', nowTime: '11:00', opensAgainInDays: 1, options: { date: '2026-10-10', leaveAt: '' } }).draft.date).toBe('2026-10-10');
  });
});
