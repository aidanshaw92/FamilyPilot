import { describe, expect, it } from 'vitest';

import { evaluateFamilyMatch } from '@/src/services/matching/family-match';
import { extractMatchableFacts } from '@/src/services/matching/venue-facts';
import { FamilyMember, FamilyProfile, Venue, VenueDetail } from '@/src/types';
import { MatchableVenueFacts } from '@/src/types/day-request';
import { VenueFamilyMetadata } from '@/src/types/places';
import { familyEssentialRows, NOT_CONFIRMED } from '@/src/utils/family-essentials';
import { applyAdvancedFilters } from '@/src/utils/filter-venues';

/**
 * Playground, accessible toilet and wheelchair access: facts the server already served from approved claims and no screen
 * showed (55 of 134 London destinations held at least one). These tests pin what each now means, and what it must not.
 */

const NOW = new Date(2026, 9, 6, 11, 0, 0);
const child = (id: string, name: string, age: number, extra: Partial<FamilyMember> = {}): FamilyMember => ({
  id, name, role: 'child', dateOfBirth: '', age, dobKnown: true, ageMonths: age === 0 ? 8 : null, mobility: ['walks'], ...extra,
});
const parent: FamilyMember = { id: 'p', name: 'Alex', role: 'parent', dateOfBirth: '', age: 38 };
const profile = (over: Partial<FamilyProfile> = {}): FamilyProfile =>
  ({
    id: 'f', parentName: 'Alex', members: [parent, child('c1', 'Sloane', 7)], homeLocation: 'N1', completionPercent: 100,
    mustHaveFacilities: [], routines: [], ...over,
  }) as FamilyProfile;
const facts = (over: Partial<MatchableVenueFacts> = {}): MatchableVenueFacts => ({
  placeId: 'fp-x', name: 'Test Place', category: 'park', driveMinutes: 20, enrichmentStatus: 'enriched',
  minRecommendedAge: null, maxRecommendedAge: null, venueAgePolicy: null,
  toilets: 'unknown', babyChanging: 'unknown', parking: 'unknown', pushchairSuitability: 'unknown',
  environment: 'unknown', energyLevel: 'unknown', visitDurationMinutes: null, estimatedSpend: null,
  goodToKnow: [], warnings: [], openingStatus: 'open', ...over,
});
const venue = (f: Partial<MatchableVenueFacts> = {}, over: Partial<Venue> = {}): Venue =>
  ({
    id: 'fp-x', name: 'Test Place', category: 'park', latitude: 51.5, longitude: -0.1, driveMinutes: 20, imageUrl: '',
    familyScore: { score: 80, factors: {} as never, explanation: [] }, enrichmentStatus: 'enriched',
    trustedFacts: facts(f), facilities: [], ...over,
  }) as Venue;
const run = (v: Venue, p = profile(), score = 80) => evaluateFamilyMatch({ venue: v, profile: p, score, now: NOW });
const rows = (v: Partial<VenueDetail>) =>
  Object.fromEntries(familyEssentialRows({ id: 'v', name: 'V', category: 'park', openingHours: '', facilities: [], ...v } as VenueDetail).map((r) => [r.key, r]));

describe('the facts reach the venue record', () => {
  const meta = {
    enrichmentStatus: 'enriched',
    familyFacilities: { playground: 'yes', toilets: 'yes' },
    accessibility: { wheelchairAccessible: 'no', accessibleToilet: 'yes' },
  } as unknown as VenueFamilyMetadata;

  it('reads the three approved claims from consumer metadata', () => {
    const f = extractMatchableFacts('fp-x', 'X', 'park', 10, 'enriched', meta);
    expect(f.playground).toBe('yes');
    expect(f.wheelchairAccessible).toBe('no');
    expect(f.accessibleToilet).toBe('yes');
  });

  it('an unreviewed venue knows none of them, whatever its metadata says', () => {
    const f = extractMatchableFacts('fp-x', 'X', 'park', 10, 'provider_only', meta);
    expect([f.playground, f.wheelchairAccessible, f.accessibleToilet]).toEqual(['unknown', 'unknown', 'unknown']);
  });
});

describe('Venue Detail: Family essentials rows', () => {
  it('shows a confirmed playground, and says when the venue states no ages', () => {
    expect(rows({ trustedFacts: facts({ playground: 'yes' }) }).playground).toMatchObject({ value: 'On site, ages not stated', confirmed: true });
    expect(rows({ trustedFacts: facts({ playground: 'yes', minRecommendedAge: 2, maxRecommendedAge: 10 }) }).playground.value).toBe('On site');
    expect(rows({ trustedFacts: facts({ playground: 'no' }) }).playground.value).toBe('None on site');
  });

  it('shows wheelchair access and the accessible toilet, yes and no', () => {
    const yes = rows({ trustedFacts: facts({ wheelchairAccessible: 'yes', accessibleToilet: 'yes' }) });
    expect(yes.wheelchair).toMatchObject({ label: 'Wheelchair access', value: 'Accessible', confirmed: true });
    expect(yes['accessible-toilet']).toMatchObject({ label: 'Accessible toilet', value: 'On site', confirmed: true });
    // "Hyde Park Corner is not wheelchair accessible": a reviewed no is shown, never hidden as unknown.
    expect(rows({ trustedFacts: facts({ wheelchairAccessible: 'no' }) }).wheelchair).toMatchObject({ value: 'Not accessible', confirmed: true });
  });

  it('unknown stays Not confirmed: nothing is inferred from buggy access, toilets or the category', () => {
    const r = rows({ category: 'park', trustedFacts: facts({ pushchairSuitability: 'excellent', toilets: 'yes' }), facilities: ['pushchair_friendly', 'toilets'] });
    expect(r.wheelchair.value).toBe(NOT_CONFIRMED);
    expect(r['accessible-toilet'].value).toBe(NOT_CONFIRMED);
    expect(r.playground.value).toBe(NOT_CONFIRMED);
  });

  it('the Diana Memorial Playground case: a venue whose only fact is its playground now shows one confirmed row', () => {
    const confirmed = familyEssentialRows({ id: 'v', name: 'V', category: 'park', openingHours: '', facilities: ['playground'], trustedFacts: facts({ playground: 'yes' }) } as VenueDetail)
      .filter((r) => r.confirmed && r.key !== 'hours');
    expect(confirmed.map((r) => r.key)).toEqual(['playground']);
  });
});

describe('Family Fit: provision is not suitability', () => {
  it('a playground adds no reason, no named child and no change of verdict for a family that did not ask for one', () => {
    const base = { toilets: 'yes', babyChanging: 'yes', pushchairSuitability: 'good' } as const;
    const without = run(venue(base), profile(), 90);
    const withPlayground = run(venue({ ...base, playground: 'yes' }, { facilities: ['playground'] }), profile(), 90);
    expect(withPlayground.verdict).toBe(without.verdict);
    expect(withPlayground.reasons.map((l) => l.text)).toEqual(without.reasons.map((l) => l.text));
    expect(withPlayground.forNames).toEqual(without.forNames);
    expect(withPlayground.reasons.some((l) => l.aspect === 'activity')).toBe(false);
  });

  it('a playground must-have is answered by the claim: yes, no, unknown', () => {
    const p = profile({ mustHaveFacilities: ['playground'] });
    expect(run(venue({ playground: 'yes', toilets: 'yes' }), p).reasons.map((l) => l.text)).toContain('Playground confirmed, which you said you need');
    const no = run(venue({ playground: 'no', toilets: 'yes' }), p);
    expect(no.verdict).toBe('poor');
    expect(run(venue({ toilets: 'yes' }), p).toCheck.map((l) => l.text)).toContain('Playground, which you said you need, still to be checked');
  });
});

describe('Family Fit: wheelchair access for a child who uses a wheelchair or mobility aid', () => {
  const p = profile({ members: [parent, child('c1', 'Quillon', 8, { mobility: ['mobility-aid'] })] });

  it('a confirmed yes is a reason, not a thing to check', () => {
    const r = run(venue({ wheelchairAccessible: 'yes', accessibleToilet: 'yes', toilets: 'yes' }), p);
    const texts = r.reasons.map((l) => l.text);
    expect(texts).toContain('Wheelchair accessible, the venue says, for Quillon');
    expect(texts).toContain('Accessible toilet on site');
    expect(r.toCheck.some((l) => /wheelchair/i.test(l.text))).toBe(false);
    // Logistics: it makes the visit possible, it does not say the place suits Quillon.
    expect(r.reasons.filter((l) => /heelchair|ccessible toilet/.test(l.text)).every((l) => l.aspect === 'logistics')).toBe(true);
  });

  it('a confirmed no is a concern for that child', () => {
    const r = run(venue({ wheelchairAccessible: 'no', toilets: 'yes' }), p);
    expect(r.verdict).toBe('poor');
    expect(r.cautions.map((l) => l.text).join(' ')).toMatch(/not wheelchair accessible/);
  });

  it('unknown is still to be checked, and buggy access is never read as wheelchair access', () => {
    const r = run(venue({ pushchairSuitability: 'excellent', toilets: 'yes' }), p);
    expect(r.toCheck.map((l) => l.text)).toContain('Step-free and wheelchair access still to be checked');
    expect(r.verdict).not.toBe('good');
  });

  it('an accessible toilet alone does not stand in for wheelchair access', () => {
    const r = run(venue({ accessibleToilet: 'yes', toilets: 'yes' }), p);
    expect(r.toCheck.map((l) => l.text)).toContain('Step-free and wheelchair access still to be checked');
    expect(r.reasons.map((l) => l.text)).not.toContain('Accessible toilet on site');
  });

  it('a family without a mobility-aid user is not told about wheelchair access at all', () => {
    const r = run(venue({ wheelchairAccessible: 'no', toilets: 'yes' }));
    expect([...r.reasons, ...r.cautions, ...r.toCheck].some((l) => /heelchair/.test(l.text))).toBe(false);
  });
});

describe('Explore filters', () => {
  const vs = [
    venue({ playground: 'yes', wheelchairAccessible: 'yes' }, { id: 'both', facilities: ['playground'] }),
    venue({ playground: 'no', wheelchairAccessible: 'no' }, { id: 'neither' }),
    venue({}, { id: 'unknown' }),
    venue({ pushchairSuitability: 'excellent' }, { id: 'buggy-only', facilities: ['pushchair_friendly'] }),
  ];
  it('Playground and Wheelchair accessible keep confirmed places only; unknown is never a match', () => {
    expect(applyAdvancedFilters(vs, ['playground']).map((v) => v.id)).toEqual(['both']);
    expect(applyAdvancedFilters(vs, ['wheelchair']).map((v) => v.id)).toEqual(['both']);
  });
});
