import { describe, expect, it } from 'vitest';

import { calculateFamilyScore } from '@/src/services/scoring/family-score';
import { personaliseVenue } from '@/src/utils/personalise-venues';
import {
  hasTrustedMatchSignals,
  scoreTrustedAgeSuitability,
  scoreTrustedFacilitiesMatch,
} from '@/src/services/scoring/trusted-family-score';
import { extractMatchableFacts } from '@/src/services/matching/venue-facts';
import { FamilyProfile, VenueDetail } from '@/src/types';
import { MatchableVenueFacts } from '@/src/types/day-request';

const PROFILE: FamilyProfile = {
  id: 'p1',
  parentName: 'Parent',
  homeLocation: 'Bushey',
  maxDriveMinutes: 30,
  budgetTier: 'moderate',
  completionPercent: 100,
  members: [
    { id: 'c1', name: 'Mia', role: 'child', dateOfBirth: '2020-01-01', age: 5 },
    { id: 'c2', name: 'Leo', role: 'child', dateOfBirth: '2022-01-01', age: 3 },
  ],
  pushchair: 'yes',
};

const BASE_FACTS: MatchableVenueFacts = {
  placeId: 'fp-google-trusted',
  name: 'Trusted Park',
  category: 'park',
  driveMinutes: 12,
  enrichmentStatus: 'enriched',
  minRecommendedAge: 2,
  maxRecommendedAge: 10,
  venueAgePolicy: null,
  toilets: 'yes',
  babyChanging: 'yes',
  parking: 'yes',
  freeParking: 'yes',
  pushchairSuitability: 'good',
  environment: 'outdoor',
  energyLevel: 'moderate',
  visitDurationMinutes: 120,
  estimatedSpend: '£',
  goodToKnow: [],
  warnings: [],
  openingStatus: 'unknown',
};

function venueWithFacts(facts: MatchableVenueFacts, overrides: Partial<VenueDetail> = {}): VenueDetail {
  return {
    id: facts.placeId,
    name: facts.name,
    category: facts.category as VenueDetail['category'],
    latitude: 51.64,
    longitude: -0.36,
    driveMinutes: facts.driveMinutes,
    imageUrl: '',
    familyScore: { score: 0, factors: {} as never, explanation: [] },
    photos: [],
    facilities: ['toilets', 'parking', 'baby_changing'],
    openingHours: '9-5',
    terrain: 'flat',
    bestAges: '2 – 10 years',
    description: 'Trusted venue',
    enrichmentStatus: 'enriched',
    trustedFacts: facts,
    ...overrides,
  };
}

describe('trusted family score helpers', () => {
  it('detects when trusted facts contain match signals', () => {
    expect(hasTrustedMatchSignals(BASE_FACTS)).toBe(true);
    expect(
      hasTrustedMatchSignals({
        ...BASE_FACTS,
        minRecommendedAge: null,
        maxRecommendedAge: null,
        venueAgePolicy: null,
        toilets: 'unknown',
        babyChanging: 'unknown',
        parking: 'unknown',
        freeParking: 'unknown',
        pushchairSuitability: 'unknown',
        environment: 'unknown',
        energyLevel: 'unknown',
        estimatedSpend: null,
      }),
    ).toBe(false);
  });

  it('scores age suitability from reviewed age range', () => {
    // Takes months now, so a baby's real age survives. BASE_FACTS recommends ages 2-10,
    // which is [24, 132) months.
    expect(scoreTrustedAgeSuitability(BASE_FACTS, [5 * 12, 3 * 12])).toBe(96);
    expect(scoreTrustedAgeSuitability(BASE_FACTS, [12 * 12])).toBe(42);
  });

  it('ranks more family-relevant confirmed evidence above less, with unknown as neutral', () => {
    // A baby and a toddler: baby changing matters most, then toilets, parking and a café.
    const babyAndToddler: FamilyProfile = {
      ...PROFILE,
      members: [
        { id: 'c1', name: 'Sloane', role: 'child', dateOfBirth: '2023-03-01', age: 3 },
        { id: 'c2', name: 'Ozzie', role: 'child', dateOfBirth: '2026-02-01', age: 0 },
      ],
    };
    const unknown = { ...BASE_FACTS, toilets: 'unknown', babyChanging: 'unknown', parking: 'unknown', freeParking: 'unknown', cafe: 'unknown' } as MatchableVenueFacts;
    const toiletsOnly = { ...unknown, toilets: 'yes' } as MatchableVenueFacts;
    const wellEvidenced = { ...unknown, toilets: 'yes', babyChanging: 'yes', parking: 'yes', cafe: 'yes' } as MatchableVenueFacts;
    const s = (f: MatchableVenueFacts) => scoreTrustedFacilitiesMatch(f, babyAndToddler)!;
    // The old ratio scored these two the same (100): one confirmed fact looked as good as four.
    expect(s(wellEvidenced)).toBeGreaterThan(s(toiletsOnly));
    expect(s(toiletsOnly)).toBeGreaterThan(s(unknown));
    expect(s(unknown)).toBe(50);
    // A confirmed no sits below silence.
    expect(s({ ...unknown, babyChanging: 'no' } as MatchableVenueFacts)).toBeLessThan(s(unknown));
    // Baby changing outweighs a café for this family.
    expect(s({ ...unknown, babyChanging: 'yes' } as MatchableVenueFacts)).toBeGreaterThan(s({ ...unknown, cafe: 'yes' } as MatchableVenueFacts));
    // A café counts at all.
    expect(s({ ...unknown, cafe: 'yes' } as MatchableVenueFacts)).toBeGreaterThan(s(unknown));
  });

  it('only counts baby changing for a child under four', () => {
    const olderKids: FamilyProfile = { ...PROFILE, members: [{ id: 'c1', name: 'Mia', role: 'child', dateOfBirth: '2017-01-01', age: 9 }] };
    const withChanging = { ...BASE_FACTS, babyChanging: 'yes' } as MatchableVenueFacts;
    const withoutChanging = { ...BASE_FACTS, babyChanging: 'no' } as MatchableVenueFacts;
    expect(scoreTrustedFacilitiesMatch(withChanging, olderKids)).toBe(scoreTrustedFacilitiesMatch(withoutChanging, olderKids));
  });

  it('scores facilities from confirmed tri-state facts', () => {
    const score = scoreTrustedFacilitiesMatch(BASE_FACTS, PROFILE);
    expect(score).toBeGreaterThan(85);
    const noParking = scoreTrustedFacilitiesMatch({ ...BASE_FACTS, parking: 'no', freeParking: 'no' }, PROFILE);
    expect(noParking).toBeLessThan(score!);
  });
});

describe('calculateFamilyScore with trusted facts', () => {
  it('uses reviewed age range instead of category guess', () => {
    const trusted = venueWithFacts(BASE_FACTS);
    const mismatchedAge = venueWithFacts({ ...BASE_FACTS, minRecommendedAge: 8, maxRecommendedAge: 14 });
    const heuristicOnly: VenueDetail = {
      ...trusted,
      trustedFacts: undefined,
      category: 'park',
    };

    const trustedScore = calculateFamilyScore(trusted, PROFILE);
    const mismatchScore = calculateFamilyScore(mismatchedAge, PROFILE);
    const heuristicScore = calculateFamilyScore(heuristicOnly, PROFILE);

    expect(trustedScore.explanation.some((line) => line.includes('Suits Mia and Leo (recommended for ages 2–10)'))).toBe(true);
    expect(mismatchScore.score).toBeLessThan(trustedScore.score);
    expect(trustedScore.score).not.toBe(heuristicScore.score);
  });

  it('explains confirmed facilities rather than category inference', () => {
    const score = calculateFamilyScore(venueWithFacts(BASE_FACTS), PROFILE);
    expect(score.explanation.some((line) => line.includes('Free parking confirmed'))).toBe(true);
    expect(score.explanation.some((line) => line.includes('baby changing confirmed'))).toBe(true);
  });

  it('still caps provider-only venues', () => {
    const score = calculateFamilyScore(
      venueWithFacts({ ...BASE_FACTS, enrichmentStatus: 'provider_only' }, { enrichmentStatus: 'provider_only' }),
      PROFILE,
      { enrichmentStatus: 'provider_only' },
    );
    expect(score.score).toBeLessThanOrEqual(65);
    // A status is not a reason: nothing in this list may be ticked green.
    expect(score.explanation.join('\n')).not.toMatch(/not yet been reviewed|location and category/i);
  });
});

describe('weather is not part of Family Fit', () => {
  it('there is no weather factor and no weather option: the score cannot be handed a forecast', () => {
    const score = calculateFamilyScore(venueWithFacts(BASE_FACTS), PROFILE);
    expect(Object.keys(score.factors)).not.toContain('weatherFit');
    // @ts-expect-error weather is deliberately not an option
    const withWeather = calculateFamilyScore(venueWithFacts(BASE_FACTS), PROFILE, { weather: { condition: 'rainy', temperature: 5, description: 'Rain' } });
    expect(withWeather).toEqual(score);
  });

  it('an outdoor and an indoor venue with the same evidence score the same whatever the day is like', () => {
    const outdoor = calculateFamilyScore(venueWithFacts({ ...BASE_FACTS, environment: 'outdoor' }), PROFILE);
    const indoor = calculateFamilyScore(venueWithFacts({ ...BASE_FACTS, environment: 'indoor' }), PROFILE);
    expect(outdoor.score).toBe(indoor.score);
  });

  it('never says anything about today\'s weather; the environment is stated as a fact about the place', () => {
    const { explanation } = calculateFamilyScore(venueWithFacts(BASE_FACTS), PROFILE);
    expect(explanation.join(' | ')).not.toMatch(/weather|rain|forecast|today/i);
    expect(explanation).toContain('Outdoor environment confirmed');
  });
});

/**
 * A reviewed fact that counts against the match is a caution, not a reason. Venue Detail ticks every
 * line of `explanation` green, so "Pushchair access reviewed as difficult" there was a false claim —
 * seen on the fixture's long-name venue at 360 wide.
 */
describe('negative reviewed facts are cautions, never reasons', () => {
  const difficult: MatchableVenueFacts = { ...BASE_FACTS, pushchairSuitability: 'difficult', parking: 'no', freeParking: 'no' };

  it('keeps pushchair-difficult and no-parking out of the ticked reasons', () => {
    const score = calculateFamilyScore(venueWithFacts(difficult), PROFILE);
    expect(score.explanation.join('\n')).not.toMatch(/difficult|not available/i);
    expect(score.cautions).toEqual(
      expect.arrayContaining(['Pushchair access reviewed as difficult', 'Parking reviewed as not available on site']),
    );
  });

  it('files an age mismatch as a caution', () => {
    const score = calculateFamilyScore(venueWithFacts({ ...BASE_FACTS, minRecommendedAge: 11, maxRecommendedAge: 16 }), PROFILE);
    expect(score.explanation.join('\n')).not.toMatch(/may not suit/i);
    // Both children (5 and 3) are under the published 11–16, so the caution names them.
    expect(score.cautions).toContain('Recommended from age 11, so Mia and Leo are younger than that');
  });

  it('does not raise the pushchair caution for a family without one', () => {
    const score = calculateFamilyScore(venueWithFacts(difficult), { ...PROFILE, pushchair: undefined });
    expect(score.cautions).not.toContain('Pushchair access reviewed as difficult');
  });

  it('never explains an over-limit drive as a reason on the trusted path either', () => {
    const far = venueWithFacts({ ...BASE_FACTS, driveMinutes: 55 }, { driveMinutes: 55 });
    const score = calculateFamilyScore(far, PROFILE);
    expect(score.explanation.join('\n')).not.toMatch(/further than/i);
  });

  it('carries the cautions on the score once, after the profile-derived ones, and leaves the venue notes alone', () => {
    const venue = personaliseVenue(
      { ...venueWithFacts({ ...difficult, driveMinutes: 55 }, { driveMinutes: 55 }), goodToKnow: ['Cafe closes at 3pm'] },
      PROFILE,
    );
    const cautions = venue.familyScore.cautions ?? [];
    expect(cautions.filter((line) => line === 'Pushchair access reviewed as difficult')).toHaveLength(1);
    expect(cautions.indexOf('Further than the 30 min drive we’re using')).toBeLessThan(cautions.indexOf('Pushchair access reviewed as difficult'));
    expect(venue.goodToKnow).toEqual(['Cafe closes at 3pm']);
    expect(cautions).not.toContain('Cafe closes at 3pm');
    expect(venue.familyScore.explanation.join('\n')).not.toMatch(/difficult/i);
  });
});

describe('a confirmed café reaches the match facts', () => {
  it('reads familyFacilities.cafe from the trusted projection, and never invents it', () => {
    const meta = { enrichmentStatus: 'enriched', familyFacilities: { cafe: 'yes', toilets: 'yes' }, facilities: ['cafe', 'toilets'] } as never;
    expect(extractMatchableFacts('fp-x', 'Park', 'park', 10, 'enriched', meta).cafe).toBe('yes');
    expect(extractMatchableFacts('fp-x', 'Park', 'park', 10, 'enriched', { enrichmentStatus: 'enriched', familyFacilities: {} } as never).cafe).toBe('unknown');
    expect(extractMatchableFacts('fp-x', 'Park', 'park', 10, 'provider_only', null).cafe).toBe('unknown');
  });
});
