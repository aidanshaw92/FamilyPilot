import { describe, expect, it } from 'vitest';

import { evaluateFamilyMatch, matchBadgeText, matchCardReason, matchClosedLine, withClosedLine } from '@/src/services/matching/family-match';
import { FamilyMember, FamilyProfile, Venue } from '@/src/types';
import { MatchableVenueFacts } from '@/src/types/day-request';
import { OpeningHoursSchedule } from '@/src/types/opening-hours';

/**
 * FamilyPilot must never say a place works TODAY while saying it is closed today; and since stable Family Fit, it must
 * not let the day change what it says about the family at all.
 *
 * History: real-device run, RAF Museum, "Possible for your family today" above "Closed for today · opens tomorrow 10am".
 * Today's opening state fed the verdict (a caution, then a breach). The first fix stopped the verdict falling and added
 * ", but not today" to the headline; that left today in the sentence, and closing-soon / open-today / weather still moved
 * verdicts and scores.
 *
 * The rule now: SUITABILITY (does this place work for this family?) and AVAILABILITY (is it open today?) are separate
 * questions with separate fields. Family Fit (verdict, headline, reasons, cautions, things to check, card line, score)
 * is IDENTICAL whatever the opening state: open, closing soon, finished for the day, shut all day, or no hours. The day
 * is reported in `today` / `availableToday` and shown as its own fact ("Closed today · opens tomorrow 10am"). The one
 * exception is a place that is never open to visitors, which is a fact about the place and not about the day.
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

/** The Family Fit result with the day taken out: this must not depend on the opening state. */
const fit = (r: ReturnType<typeof match>) => {
  const { today: _today, availableToday: _available, ...rest } = r;
  return rest;
};

describe('every opening state: the right availability, and Family Fit identical', () => {
  const baseline = fit(match(SCHEDULES['hours unknown'].hours));
  for (const [name, { hours, state, available }] of Object.entries(SCHEDULES)) {
    it(name, () => {
      const r = match(hours);
      expect(r.today.state).toBe(state);
      expect(r.availableToday).toBe(available);
      // The whole of what is said about the family, deep-equal to the same place with no hours at all.
      expect(fit(r)).toEqual(baseline);
      // And nothing of the day leaks into a sentence about the family.
      for (const line of everything(r)) {
        expect(line, line).not.toMatch(/\btoday\b|closing soon|closed|open (now|until)|opens/i);
      }
      expect(r.cautions.map((l) => l.key)).not.toEqual(expect.arrayContaining(['closed-today']));
      expect(r.reasons.map((l) => l.key)).not.toContain('open-today');
      expect(r.cautions.map((l) => l.key)).not.toContain('closing-soon');
    });
  }
});

describe('closed today is a fact beside the fit, not part of it', () => {
  it('the verdict, headline and badge are the same as on a day it is open', () => {
    const open = match(SCHEDULES['open now'].hours);
    expect(['good', 'excellent']).toContain(open.verdict);
    for (const name of ['opens later today', 'closing soon', 'already closed for today', 'closed all day today', 'hours unknown']) {
      const r = match(SCHEDULES[name].hours);
      expect(r.verdict, name).toBe(open.verdict);
      expect(r.headline, name).toBe(open.headline);
      expect(matchBadgeText(r), name).toBe(matchBadgeText(open));
    }
  });

  it('the RAF Museum case: a good place finished for the day reads "Good for Sloane", and the card says it is closed as a fact', () => {
    const r = match(SCHEDULES['already closed for today'].hours);
    expect(r.headline).toMatch(/^(Good|Excellent) for Sloane$/);
    expect(r.today.label).toMatch(/^Closed for today · opens tomorrow \d+(am|pm)$/);
    expect(matchClosedLine(r)).toBe(r.today.label);
    expect(withClosedLine(r, matchCardReason(r))).toMatch(/^Closed for today · opens tomorrow \d+(am|pm) · /);
  });

  it('a place shut all day says when it next opens, and is still not called a poor fit', () => {
    const r = match(SCHEDULES['closed all day today'].hours);
    expect(r.today.label).toBe('Closed today · opens tomorrow 10am');
    expect(matchClosedLine(r)).toBe('Closed today · opens tomorrow 10am');
    expect(r.verdict).not.toBe('poor');
    expect(r.headline).not.toMatch(/^Probably not/);
  });

  it('an open place adds nothing to its card: the closed line exists only when it is closed', () => {
    for (const name of ['open now', 'opens later today', 'closing soon', 'hours unknown']) {
      const r = match(SCHEDULES[name].hours);
      expect(matchClosedLine(r), name).toBeNull();
      expect(withClosedLine(r, 'x'), name).toBe('x');
    }
  });

  it('no "leave by … for the nap" or opening claim for a day they cannot go', () => {
    const r = match(SCHEDULES['already closed for today'].hours);
    expect(r.reasons.map((l) => l.key)).not.toContain('routine');
    expect(r.reasons.map((l) => l.key)).not.toContain('open-today');
    expect(r.cautions.map((l) => l.key)).not.toContain('routine-clash');
  });

  it('a confirmed breach still makes it poor, whatever the opening state', () => {
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
