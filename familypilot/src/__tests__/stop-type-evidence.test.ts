import { describe, expect, it } from 'vitest';

import { planStopFromFoodCandidate, stopFacts } from '@/src/services/planning/day-plan';
import { PlanningFamily } from '@/src/services/planning/planner';
import { SequenceOptions, homeKey, sequenceDay, stopKey } from '@/src/services/planning/sequencer';
import { isRelevantEvidence, stopEvidenceKind } from '@/src/services/planning/stop-evidence';
import { MatchableVenueFacts } from '@/src/types/day-request';
import { JourneyMatrix, StopRequest } from '@/src/types/day-sequence';
import { FoodCandidate } from '@/src/types/nearby-food';

/**
 * A plan's evidence is judged by what each stop is FOR (stop-evidence.ts).
 *
 * The real-device test: a generated day with a lunch stop told the parent, under lunch, that "Recommended ages are not
 * published for this place" and "What a visit costs is not confirmed". True of the café, and irrelevant to it. These pin
 * that a food stop is asked only what decides whether a family can eat there, that an attraction is still asked
 * everything, and that the rules underneath (confirmed missing must-have = conflict, unknown = check) are unchanged.
 */

const now = new Date('2026-09-20T08:00:00');
const TUESDAY = '2026-09-22';

/** An attraction nobody has published ages or prices for. */
const zooFacts = (over: Partial<MatchableVenueFacts> = {}): MatchableVenueFacts => ({
  placeId: 'fp-zoo',
  name: 'Kentish Town City Farm',
  category: 'farm',
  driveMinutes: 0,
  enrichmentStatus: 'enriched',
  minRecommendedAge: null,
  maxRecommendedAge: null,
  venueAgePolicy: null,
  toilets: 'yes',
  babyChanging: 'yes',
  parking: 'yes',
  pushchairSuitability: 'good',
  environment: 'outdoor',
  energyLevel: 'moderate',
  visitDurationMinutes: 120,
  estimatedSpend: null,
  goodToKnow: [],
  warnings: [],
  openingStatus: 'unknown',
  ...over,
});

const attraction = (over: Partial<MatchableVenueFacts> = {}): StopRequest => ({
  placeId: 'fp-zoo',
  name: 'Kentish Town City Farm',
  role: 'activity',
  anchor: true,
  dwellMinutes: 120,
  facts: zooFacts(over),
});

/** A real lunch stop as the planner builds it: an OpenStreetMap café with no reviewed facts at all. */
const osmCafe: FoodCandidate = {
  familypilotId: 'osm-node-1',
  externalId: 'node/1',
  provider: 'osm',
  name: 'Mapped Kitchen',
  category: 'cafe',
  latitude: 51.55,
  longitude: -0.14,
  distanceKm: 0.3,
  cuisine: null,
  openingHours: null,
  address: null,
  website: null,
  phone: null,
  tagged: {},
  travel: [],
};

const lunch = (over: Partial<MatchableVenueFacts> = {}): StopRequest => {
  const source = planStopFromFoodCandidate(osmCafe);
  return {
    placeId: source.placeId,
    name: source.name,
    role: 'meal',
    anchor: false,
    dwellMinutes: 45,
    facts: { ...stopFacts(source), ...over },
  };
};

const family = (required: PlanningFamily['required'] = []): PlanningFamily => ({
  id: 'mine',
  label: 'Our family',
  area: 'NW5',
  latitude: 51.55,
  longitude: -0.14,
  ages: [1, 4],
  maxDriveMinutes: 45,
  budgetTier: 'moderate',
  pushchair: false,
  required,
  routines: [],
});

const options = (environment: SequenceOptions['environment'] = 'either'): SequenceOptions => ({
  date: TUESDAY,
  leaveAt: '09:00',
  returnBy: '',
  bufferMinutes: 10,
  environment,
});

const matrix: JourneyMatrix = {
  legs: Object.fromEntries(
    Object.entries({
      [homeKey('mine')]: { [stopKey('fp-zoo')]: 15, [stopKey('osm-node-1')]: 15 },
      [stopKey('fp-zoo')]: { [homeKey('mine')]: 15, [stopKey('osm-node-1')]: 5 },
      [stopKey('osm-node-1')]: { [homeKey('mine')]: 15, [stopKey('fp-zoo')]: 5 },
    }).map(([from, tos]) => [
      from,
      Object.fromEntries(Object.entries(tos).map(([to, minutes]) => [to, { minutes, source: 'estimated' as const }])),
    ]),
  ),
};

const day = (stops: StopRequest[], required: PlanningFamily['required'] = [], environment: SequenceOptions['environment'] = 'either') =>
  sequenceDay(stops, [family(required)], matrix, options(environment), now);

describe('what a stop is for', () => {
  it('a lunch stop is food, whatever its category', () => {
    expect(stopEvidenceKind({ role: 'meal', category: 'restaurant' })).toBe('food');
    expect(stopEvidenceKind({ role: 'meal', category: 'farm' })).toBe('food');
  });

  it('a café or restaurant chosen as the day’s venue is a food venue; any other venue is an attraction', () => {
    expect(stopEvidenceKind({ role: 'activity', category: 'cafe' })).toBe('food-venue');
    expect(stopEvidenceKind({ role: 'activity', category: 'restaurant' })).toBe('food-venue');
    expect(stopEvidenceKind({ role: 'activity', category: 'farm' })).toBe('attraction');
    expect(stopEvidenceKind({ role: 'activity', category: 'museum' })).toBe('attraction');
    expect(stopEvidenceKind({ role: 'activity' })).toBe('attraction');
  });

  it('a food stop is asked about getting there, the door, buggies, toilets, changing and parking, and nothing else', () => {
    const food = ['journey', 'ageAdmission', 'pushchairSuitability', 'familyFacilities.toilets', 'familyFacilities.babyChanging', 'familyFacilities.parking'];
    const dayOut = ['ageRecommendedFit', 'estimatedSpend', 'environment', 'energyLevel', 'visitDurationMinutes'];
    for (const field of food) expect(isRelevantEvidence('food', field), field).toBe(true);
    for (const field of dayOut) expect(isRelevantEvidence('food', field), field).toBe(false);
    for (const field of [...food, ...dayOut]) expect(isRelevantEvidence('attraction', field), field).toBe(true);
  });

  it('a café chosen as the day’s venue is still asked the day’s indoor/outdoor setting (it IS the activity), but not ages or cost', () => {
    expect(isRelevantEvidence('food-venue', 'environment')).toBe(true);
    for (const field of ['ageRecommendedFit', 'estimatedSpend', 'energyLevel', 'visitDurationMinutes']) {
      expect(isRelevantEvidence('food-venue', field), field).toBe(false);
    }
    for (const field of ['journey', 'ageAdmission', 'pushchairSuitability', 'familyFacilities.toilets', 'familyFacilities.babyChanging', 'familyFacilities.parking']) {
      expect(isRelevantEvidence('food-venue', field), field).toBe(true);
    }
  });
});

describe('an attraction stop is still asked everything a day out depends on', () => {
  it('says plainly, naming the place, that its ages and cost are not published', () => {
    const result = day([attraction()]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.itinerary.unknowns).toContain('Recommended ages are not published for Kentish Town City Farm');
    expect(result.itinerary.unknowns).toContain('What a visit costs at Kentish Town City Farm is not confirmed');
  });
});

describe('a lunch stop is never asked an attraction’s questions', () => {
  it('a café with nothing reviewed gets no age or cost line, but its unconfirmed hours are still said', () => {
    const result = day([attraction(), lunch()]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const about = result.itinerary.unknowns.filter((line) => line.includes('Mapped Kitchen'));
    expect(about).toEqual(['Opening hours not confirmed at Mapped Kitchen']);
    expect(result.itinerary.unknowns.join('\n')).not.toMatch(/Recommended ages[^\n]*Mapped Kitchen|costs at Mapped Kitchen/);
  });

  it('the day’s indoor/outdoor choice is about the activity, so lunch is not flagged for it', () => {
    const result = day([attraction({ environment: 'indoor' }), lunch()], [], 'indoor');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.itinerary.unresolvedMustHaves.filter((item) => item.stopName === 'Mapped Kitchen')).toEqual([]);
    expect(result.itinerary.unknowns.join('\n')).not.toMatch(/Whether Mapped Kitchen is indoors/);
  });
});

describe('unknown evidence at lunch: still a thing to check, never a yes and never a no', () => {
  it('a must-have nobody has confirmed at the café is carried as needing a check, naming the café', () => {
    const result = day([attraction(), lunch()], ['babyChanging']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.itinerary.unresolvedMustHaves).toEqual([
      expect.objectContaining({ stopName: 'Mapped Kitchen', field: 'familyFacilities.babyChanging' }),
    ]);
    expect(result.itinerary.unknowns).toContain('Baby changing is not confirmed at Mapped Kitchen');
    // Confirmed at the farm, so nothing is said about it there.
    expect(result.itinerary.unknowns.join('\n')).not.toMatch(/Baby changing is not confirmed at Kentish Town/);
  });
});

describe('a confirmed missing must-have at a food stop is still a hard conflict', () => {
  it('refuses the day rather than reporting an absence as a check', () => {
    const result = day([attraction(), lunch({ babyChanging: 'no' })], ['babyChanging']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toEqual(
      expect.objectContaining({ reason: 'requirement-unmet', placeId: 'osm-node-1' }),
    );
  });

  it('and a confirmed age rule at the door still applies at lunch', () => {
    const result = day([
      attraction(),
      lunch({ venueAgePolicy: { restrictions: [{ minMonthsInclusive: 216, maxMonthsExclusive: null, sourceUrl: 'https://example.org/policy', checkedAt: null }], caveats: [], sourcesDisagree: false } }),
    ]);
    expect(result.ok).toBe(false);
  });
});

describe('a mixed day: attraction + lunch', () => {
  it('asks the attraction about ages and cost, asks lunch only what lunch needs, and keeps each line on its own stop', () => {
    const result = day([attraction({ pushchairSuitability: 'unknown' }), lunch()], ['pushchair']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const lines = result.itinerary.unknowns;
    expect(lines).toContain('Recommended ages are not published for Kentish Town City Farm');
    expect(lines).toContain('Pushchair access is not confirmed at Kentish Town City Farm');
    expect(lines).toContain('Pushchair access is not confirmed at Mapped Kitchen');
    expect(lines.filter((line) => /Mapped Kitchen/.test(line)).sort()).toEqual([
      'Opening hours not confirmed at Mapped Kitchen',
      'Pushchair access is not confirmed at Mapped Kitchen',
    ]);
    expect(result.itinerary.unresolvedMustHaves.map((item) => `${item.stopName}:${item.field}`).sort()).toEqual([
      'Kentish Town City Farm:pushchairSuitability',
      'Mapped Kitchen:pushchairSuitability',
    ]);
  });
});
