import { afterEach, describe, expect, it, vi } from 'vitest';

import { rankForFamily } from '@/src/services/places/home-list';
import { mergePlaceToVenue } from '@/src/services/places/merge-place';
import { matchCardReason, matchClosedLine } from '@/src/services/matching/family-match';
import { parentObservationsFromTrust } from '@/src/services/matching/parent-observations';
import { personaliseVenue } from '@/src/utils/personalise-venues';
import type { FacilityType, FamilyProfile, Venue } from '@/src/types';
import type { ExternalPlaceRecord, VenueFamilyMetadata } from '@/src/types/places';

/**
 * STABLE FAMILY FIT. Whether a place suits a family is the same on a wet Tuesday it is shut as on a sunny Saturday it is
 * open. Today's weather, opening state and closing time are conditions of the day: reported beside the fit, never in it.
 *
 * Driven through Home's real ranking (`rankForFamily`, the same personalisation Explore, Halfway and Venue Detail use)
 * under every kind of day, with the clock, the schedule and the stored open-now flag all varied.
 */

const FAMILY = {
  id: 'f', parentName: 'Aidan',
  members: [
    { id: 'p1', name: 'Aidan', role: 'parent', dateOfBirth: '1990-03-15', age: 36 },
    { id: 'c1', name: 'Sloane', role: 'child', dateOfBirth: '2023-03-01', age: 3, dobKnown: true, mobility: ['walks'] },
    { id: 'c2', name: 'Ozzie', role: 'child', dateOfBirth: '2026-02-01', age: 0, ageMonths: 8, dobKnown: true, mobility: ['buggy', 'carrier'] },
  ],
  homeLocation: 'Mill Hill', homeLatitude: 51.615, homeLongitude: -0.245, budgetTier: 'moderate', maxDriveMinutes: 45,
  completionPercent: 90, memberships: [], mustHaveFacilities: [], routines: [],
} as unknown as FamilyProfile;

type Hours = { weekdayText: string[]; periods: unknown[]; timeZone: string };
const hours = (days: number[], open = 9, close = 17): Hours => ({
  weekdayText: [],
  periods: days.map((day) => ({ open: { day, hour: open, minute: 0 }, close: { day, hour: close, minute: 0 } })),
  timeZone: 'Europe/London',
});
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

const place = (n: number, name: string, category: string, lat: number, lng: number, metadata: Partial<VenueFamilyMetadata> | null, openingHours: Hours = hours(EVERY_DAY), isOpen = true) => {
  const id = `fp-stable-${n}`;
  const record = {
    familypilotId: id, externalId: `stable:${n}`, provider: 'google', name, latitude: lat, longitude: lng, category,
    address: '', photos: [], openingHours, isOpen, fetchedAt: new Date().toISOString(),
    enrichmentStatus: metadata ? 'enriched' : 'provider_only',
  } as unknown as ExternalPlaceRecord;
  const meta = metadata
    ? ({ familypilotPlaceId: id, enrichmentStatus: 'enriched', provenance: {}, goodToKnow: [], facilities: [], ...metadata } as VenueFamilyMetadata)
    : null;
  return { record, meta };
};

const ENRICHED = {
  minRecommendedAge: 0, maxRecommendedAge: 8, pushchairSuitability: 'good' as const, environment: 'outdoor' as const,
  familyFacilities: { toilets: 'yes' as const, babyChanging: 'yes' as const, parking: 'yes' as const }, facilities: ['toilets', 'baby_changing', 'parking'] as FacilityType[],
};

/** The catalogue is built per clock: the stored schedule is the venue's, the same in every test; only the day differs. */
const catalogue = (shutDay?: number) => {
  const days = shutDay == null ? EVERY_DAY : EVERY_DAY.filter((d) => d !== shutDay);
  return [
    place(1, 'Kettleford Play House', 'soft_play', 51.56, -0.29, { ...ENRICHED, environment: 'indoor' }, hours(days)),
    place(2, 'Marlow End Farm', 'farm', 51.66, -0.12, ENRICHED, hours(days)),
    place(3, 'Hollybank Gardens', 'park', 51.58, -0.18, { familyFacilities: { toilets: 'yes' }, facilities: ['toilets'], environment: 'outdoor' }, hours(days)),
    place(4, 'Larchmere Water Gardens', 'park', 51.6, -0.27, null, hours(days)),
  ];
};
const venuesFor = (shutDay?: number): Venue[] => catalogue(shutDay).map(({ record, meta }) => mergePlaceToVenue(record, meta, FAMILY.homeLatitude!, FAMILY.homeLongitude!));

/** Everything a parent reads about the fit of each place, in Home's order. The shut-today fact is separate (see below). */
function browse(clock: string, shutDay?: number) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${clock}+01:00`));
  try {
    return rankForFamily(venuesFor(shutDay), FAMILY).map((v) => ({
      id: v.id, score: v.familyScore.score, verdict: v.familyMatch?.verdict, headline: v.familyMatch?.headline,
      card: v.familyMatch ? matchCardReason(v.familyMatch) : '',
      reasons: v.familyMatch?.reasons.map((l) => l.text), cautions: v.familyMatch?.cautions.map((l) => l.text), toCheck: v.familyMatch?.toCheck.map((l) => l.text),
      factors: v.familyScore.factors, explanation: v.familyScore.explanation,
    }));
  } finally {
    vi.useRealTimers();
  }
}

afterEach(() => vi.useRealTimers());

// Tuesday 6 October 2026 in London.
const DAYS = {
  'morning, open': ['2026-10-06T10:30:00', undefined],
  'closing soon (16:40)': ['2026-10-06T16:40:00', undefined],
  'finished for the day (19:00)': ['2026-10-06T19:00:00', undefined],
  'shut all day (Tuesday)': ['2026-10-06T10:30:00', 2],
  'a different day entirely (Saturday)': ['2026-10-10T10:30:00', undefined],
} as const;

describe('the fit is identical whatever the day is like', () => {
  const reference = browse(DAYS['morning, open'][0]);
  for (const [name, [clock, shut]] of Object.entries(DAYS)) {
    it(`${name}: same order, scores, verdicts, headlines, reasons, cautions and card lines`, () => {
      expect(browse(clock, shut)).toEqual(reference);
    });
  }

  it('nothing a parent reads about the fit mentions the day: no "today", "closing soon", "open until", weather or rain', () => {
    const said = JSON.stringify(reference.map(({ headline, card, reasons, cautions, toCheck, explanation }) => [headline, card, reasons, cautions, toCheck, explanation]));
    expect(said).not.toMatch(/today|closing soon|open until|opens|weather|rain|forecast|sunny/i);
  });

  it('there is no weather factor in the score', () => {
    for (const row of reference) expect(Object.keys(row.factors)).not.toContain('weatherFit');
  });
});

describe('shut today is a fact beside the fit, and never removes a place', () => {
  it('a place shut all day today stays in Home/Explore at the same position, marked as shut', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-06T10:30:00+01:00'));
    const open = rankForFamily(venuesFor(), FAMILY);
    const shut = rankForFamily(venuesFor(2), FAMILY);
    vi.useRealTimers();
    expect(shut.map((v) => v.id)).toEqual(open.map((v) => v.id));
    expect(shut).toHaveLength(4);
    for (const v of shut) {
      expect(v.familyMatch?.availableToday).toBe(false);
      expect(matchClosedLine(v.familyMatch!)).toMatch(/^Closed today · opens tomorrow 9am$/);
    }
    for (const v of open) expect(matchClosedLine(v.familyMatch!)).toBeNull();
  });

  it('a place whose hours say it is never open to visitors is still left out: that is a fact about the place', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-06T10:30:00+01:00'));
    const never = place(9, 'Boarded-Up Hall', 'attraction', 51.6, -0.2, ENRICHED, { weekdayText: [], periods: [], timeZone: 'Europe/London' });
    const list = rankForFamily([mergePlaceToVenue(never.record, never.meta, FAMILY.homeLatitude!, FAMILY.homeLongitude!)], FAMILY);
    vi.useRealTimers();
    expect(list).toHaveLength(0);
  });
});

describe('parent reports correct the fit afterwards; they never delay it or raise it', () => {
  const trust = (basis: string, over: Record<string, unknown> = {}) => ({
    fields: {
      toilets: {
        confidence: { basis, influencesFit: basis !== 'parent_single' }, reportCount: basis === 'parent_single' ? 1 : 3, observations: ['no'],
        sourceUrl: 'https://example.org/visit', checkedAt: '2026-09-01', ...over,
      },
    },
  });
  const base = () => {
    const { record, meta } = place(1, 'Kettleford Play House', 'soft_play', 51.56, -0.29, ENRICHED);
    return mergePlaceToVenue(record, meta, FAMILY.homeLatitude!, FAMILY.homeLongitude!);
  };
  const RANK = { excellent: 4, good: 3, possible: 2, poor: 1, not_reviewed: 0 } as const;

  it('without reports, the page has the official facts at once (no reports are needed to render)', () => {
    const v = personaliseVenue(base(), FAMILY);
    expect(v.familyMatch?.reasons.map((l) => l.text).join(' ')).toMatch(/Toilets/i);
  });

  it('a contradicting report withdraws the fact from the reasons and says it needs rechecking; the official claim is untouched', () => {
    const venue = base();
    const factsBefore = JSON.stringify(venue.trustedFacts);
    const before = personaliseVenue(venue, FAMILY);
    const after = personaliseVenue(venue, FAMILY, parentObservationsFromTrust(trust('needs_recheck') as never));
    expect(after.familyMatch?.toCheck.map((l) => l.text).join(' ')).toMatch(/Toilets needs rechecking: recent parent reports differ from the venue’s own information/);
    expect(after.familyMatch?.reasons.map((l) => l.text).join(' ')).not.toMatch(/^Toilets|Toilets confirmed/i);
    expect(RANK[after.familyMatch!.verdict]).toBeLessThanOrEqual(RANK[before.familyMatch!.verdict]);
    expect(JSON.stringify(venue.trustedFacts)).toBe(factsBefore);
  });

  it('a single report never reaches Family Fit at all', () => {
    const venue = base();
    const obs = parentObservationsFromTrust(trust('parent_single') as never);
    expect(obs).toEqual({});
    expect(personaliseVenue(venue, FAMILY, obs).familyMatch).toEqual(personaliseVenue(venue, FAMILY).familyMatch);
  });

  it('corroborated parent reports are labelled as parent-reported, never confirmed, never a reason', () => {
    const venue = base();
    const unknownToilets = { ...venue, trustedFacts: { ...venue.trustedFacts!, toilets: 'unknown' as const } } as Venue;
    const obs = parentObservationsFromTrust(trust('parent_corroborated', { observations: ['yes'], sourceUrl: null, checkedAt: null }) as never);
    const m = personaliseVenue(unknownToilets, FAMILY, obs).familyMatch!;
    const lines = [...m.toCheck, ...m.cautions].map((l) => l.text).join(' | ');
    expect(lines).toMatch(/parent-reported, not confirmed by the venue/);
    expect(m.reasons.map((l) => l.text).join(' ')).not.toMatch(/parent-reported/);
    expect(RANK[m.verdict]).toBeLessThanOrEqual(RANK[personaliseVenue(unknownToilets, FAMILY).familyMatch!.verdict]);
  });
});

describe('the venue page: what blocks it and what does not (wiring)', () => {
  it('getById waits for the detail alone; weather and parent reports load separately, after', async () => {
    const fs = await import('node:fs');
    const api = fs.readFileSync('src/services/api/index.ts', 'utf8');
    const getById = api.slice(api.indexOf('async getById'), api.indexOf('withParentObservations('));
    expect(getById).not.toMatch(/Promise\.all|fetchLiveWeather|fetchParentObservations/);
    const page = fs.readFileSync('app/venue/[id].tsx', 'utf8');
    // Reports are read only once the REAL detail is in (never for the card standing in for it) ...
    expect(page).toMatch(/useParentObservations\(id \?\? '', Boolean\(baseVenue\) && !pending\)/);
    // ... and are applied to the detail already on screen, only when not pending.
    expect(page).toMatch(/baseVenue && !pending \? venueService\.withParentObservations\(baseVenue, parentReports\.data\)/);
    // The forecast is a separate, late condition on the Today card, not an input to the fit.
    expect(page).toMatch(/<TodayCard hours=\{venue\.structuredOpeningHours\} weather=\{weather\}/);
  });

  it('planning reads the venue detail without parent reports or the card placeholder', async () => {
    const fs = await import('node:fs');
    const hooks = fs.readFileSync('src/hooks/use-queries.ts', 'utf8');
    // The placeholder is opt-in and only the venue screen opts in.
    expect(hooks).toMatch(/placeholderData: options\.showCardWhileLoading/);
    const optIns = fs.readdirSync('app', { recursive: true }).map(String).filter((f) => f.endsWith('.tsx')).filter((f) => fs.readFileSync(`app/${f}`, 'utf8').includes('showCardWhileLoading'));
    expect(optIns).toEqual([expect.stringContaining('venue')]);
  });
});

describe('under-12-month convention (a product convention, not a claim)', () => {
  const logisticsOnly = (ageMonths: number, name = 'Ozzie') => {
    const profile = {
      ...FAMILY,
      members: [FAMILY.members[0], { id: 'c9', name, role: 'child', dateOfBirth: '', age: ageMonths >= 12 ? 1 : 0, ageMonths, dobKnown: true, mobility: ['buggy'] }],
    } as unknown as FamilyProfile;
    const { record, meta } = place(7, 'Quiet Court', 'attraction', 51.6, -0.2, {
      pushchairSuitability: 'good', familyFacilities: { toilets: 'yes', babyChanging: 'yes', parking: 'yes' }, facilities: ['toilets', 'baby_changing', 'parking'],
    });
    return personaliseVenue(mergePlaceToVenue(record, meta, profile.homeLatitude!, profile.homeLongitude!), profile).familyMatch!;
  };

  it('a baby under 12 months is led by logistics: no activity gap is raised for them', () => {
    const m = logisticsOnly(8);
    expect(m.toCheck.map((l) => l.key)).not.toContain('child-nothing-confirmed');
  });

  it('but it can never create an activity claim: no "Good for Ozzie", no activity-basis lens, no age wording', () => {
    const m = logisticsOnly(8);
    expect(m.headline).not.toMatch(/^(Good|Excellent|Possible) for Ozzie/);
    expect(m.children[0].basis).not.toBe('activity');
    expect(m.forNames).toEqual([]);
    expect(JSON.stringify(m)).not.toMatch(/recommended for ages|great age|suits Ozzie/i);
  });

  it('a child of 12 months or more with only logistics gets the "not yet confirmed" activity line', () => {
    const m = logisticsOnly(13);
    expect(m.toCheck.map((l) => l.key)).toContain('child-nothing-confirmed');
    expect(m.children[0].basis).toBe('logistics');
  });
});

describe('weather is a condition of the day, stated plainly beside the fit', () => {
  it('says nothing without a forecast, and does not claim indoor/outdoor for a place nobody has confirmed', async () => {
    const { describeWeatherToday } = await import('@/src/utils/day-conditions');
    const rain = { condition: 'rainy', temperature: 11, description: 'Light rain' } as const;
    expect(describeWeatherToday(null, 'indoor')).toBeNull();
    expect(describeWeatherToday(undefined, 'outdoor')).toBeNull();
    expect(describeWeatherToday(rain, 'indoor')).toBe('Light rain today · indoors');
    expect(describeWeatherToday(rain, 'outdoor')).toBe('Light rain today · outdoors');
    expect(describeWeatherToday(rain, 'unknown')).toBe('Light rain today');
    expect(describeWeatherToday(rain, undefined)).toBe('Light rain today');
    // A plain statement: never an instruction, a rating or a caution.
    expect(describeWeatherToday(rain, 'outdoor')).not.toMatch(/should|avoid|best|better|worse|may not|caution/i);
  });
});
