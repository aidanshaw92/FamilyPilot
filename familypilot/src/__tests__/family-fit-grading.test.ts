import { describe, expect, it, vi } from 'vitest';

import { STORED_VENUES } from './fixtures/stored-venues';
import { REPORT_HOUSEHOLDS, gradeStored } from './grades-report.test';
import { evaluateFamilyMatch, matchBadgeText, matchCardReason } from '@/src/services/matching/family-match';
import { extractMatchableFacts } from '@/src/services/matching/venue-facts';
import { createPlan } from '@/src/services/planning/create-plan';
import { PlanStopSource } from '@/src/services/planning/day-plan';
import { PlanDraft } from '@/src/services/planning/plan-draft';
import { PlanningFamily } from '@/src/services/planning/planner';
import { buildJourneyMatrix } from '@/src/services/planning/journey-matrix';
import { homeKey, stopKey } from '@/src/services/planning/sequencer';
import { JourneyMatrix } from '@/src/types/day-sequence';
import { FamilyMember, FamilyProfile, Venue } from '@/src/types';
import { MatchableVenueFacts } from '@/src/types/day-request';

/**
 * FAMILY FIT GRADING (docs/FAMILY_FIT_GRADING.md): suitability read the way an experienced parent reads a place, kept
 * apart from how much has been checked about it. The regression cases the founder asked for, against the venues as the
 * hosted catalogue holds them (fixtures/stored-venues.ts, read-only on 2026-10-12) where a real row exists, and clearly
 * synthetic facts where no stored row carries the fact in question (an age restriction, difficult access).
 */
const NOW = new Date(2026, 9, 12, 10, 0, 0);
const kid = (id: string, name: string, age: number, extra: Partial<FamilyMember> = {}): FamilyMember => ({ id, name, role: 'child', dateOfBirth: '', age, dobKnown: true, ageMonths: age === 0 ? 7 : null, mobility: ['walks'], ...extra });
const parent: FamilyMember = { id: 'p', name: 'Sarah', role: 'parent', dateOfBirth: '', age: 36 };
const household = (kids: FamilyMember[], over: Partial<FamilyProfile> = {}): FamilyProfile =>
  ({ id: 'f', parentName: 'Sarah', members: [parent, ...kids], homeLocation: 'Camden', homeLatitude: 51.539, homeLongitude: -0.142, budgetTier: 'moderate', maxDriveMinutes: 60, mustHaveFacilities: [], routines: [], memberships: [], travelCot: null, ...over }) as unknown as FamilyProfile;
const threeAndBaby = (mobility: FamilyMember['mobility'] = ['buggy']) => household([kid('c1', 'Sloane', 3), kid('c2', 'Ozzie', 0, { mobility })]);

const synthetic = (category: string, over: Partial<MatchableVenueFacts>): Venue => {
  const facts: MatchableVenueFacts = {
    placeId: 'fp-synthetic', name: 'Synthetic Place', category, driveMinutes: 20, enrichmentStatus: 'enriched',
    minRecommendedAge: null, maxRecommendedAge: null, venueAgePolicy: null,
    toilets: 'yes', babyChanging: 'yes', parking: 'unknown', cafe: 'yes', playground: 'unknown', pushchairSuitability: 'unknown',
    environment: 'unknown', energyLevel: 'unknown', visitDurationMinutes: null, estimatedSpend: null, goodToKnow: [], warnings: [], openingStatus: 'open', ...over,
  } as MatchableVenueFacts;
  return { id: over.placeId ?? 'fp-synthetic', name: 'Synthetic Place', category, latitude: 51.5, longitude: -0.1, driveMinutes: 20, imageUrl: '', familyScore: { score: 80, factors: {} as never, explanation: [] }, enrichmentStatus: 'enriched', facilities: ['toilets', 'cafe'], trustedFacts: facts } as unknown as Venue;
};
const read = (venue: Venue, profile: FamilyProfile) => evaluateFamilyMatch({ venue, profile, score: 80, now: NOW });
const texts = (lines: { text: string }[]) => lines.map((l) => l.text);

describe('Golders Hill Park, as stored, for a three-year-old and a baby', () => {
  // Stored on 2026-10-12: toilets, baby changing, café and a children's playground confirmed from the official page; no
  // recommended ages, no buggy rating, no parking claim. The zoo is a separate, unreviewed record and is not read here.
  it('was a Possible fit before (buggy access unknown was a hard unknown; the playground counted for nothing)', () => {
    const before = JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, 'golden', 'grades-before.json'), 'utf8'));
    expect(before['3-year-old and a baby in a buggy']['Golders Hill Park'].verdict).toBe('possible');
    expect(before['3-year-old and a baby who is carried']['Golders Hill Park'].verdict).toBe('good');
  });

  it('is a Good fit with the baby in a buggy: the playground makes it likely good for Sloane, and buggy access is the one thing to check', () => {
    const v = gradeStored(threeAndBaby(['buggy']), 'goldersHill');
    const m = v.familyMatch!;
    expect(m.verdict).toBe('good');
    expect(m.headline).toBe('Likely good for Sloane, but check buggy access for Ozzie');
    expect(matchBadgeText(m, 40)).toBe('Likely good for Sloane · check Ozzie');
    const playground = m.reasons.find((l) => l.inferred);
    expect(playground?.text).toBe('A children’s playground is confirmed here, which usually suits a 3-year-old like Sloane');
    expect(texts(m.reasons)).toEqual(expect.arrayContaining(['Baby changing confirmed, handy for Ozzie', 'Toilets confirmed on site', 'Café on site']));
    expect(texts(m.toCheck)).toEqual(['Buggy access still to be checked for Ozzie’s buggy']);
    expect(m.cautions).toEqual([]);
    // Evidence completeness is reported beside the grade, not folded into it.
    expect(m.evidenceCompleteness).toMatchObject({ known: 4, total: 7, level: 'partly' });
    expect(m.evidenceCompleteness.missing).toEqual(['parking', 'buggy access', 'which ages it suits']);
  });

  it('is an Excellent fit with the baby carried: nothing the household would want to know is still open', () => {
    const m = gradeStored(threeAndBaby(['carrier']), 'goldersHill').familyMatch!;
    expect(m.verdict).toBe('excellent');
    expect(m.headline).toBe('Excellent for Sloane, and easy to visit with Ozzie');
    expect(m.toCheck).toEqual([]);
    expect(m.evidenceCompleteness.missing).toEqual(['parking', 'which ages it suits']);
  });

  it('nothing is hardcoded for the park: the same stored facts at any other park grade the same way', () => {
    const copy = { ...STORED_VENUES.goldersHill, id: 'fp-another-park', name: 'Another Park' };
    const facts = extractMatchableFacts(copy.id, copy.name, 'park', 20, 'enriched', copy.metadata, true);
    const venue = { ...synthetic('park', facts), id: copy.id, facilities: copy.metadata.facilities } as Venue;
    expect(read(venue, threeAndBaby(['carrier'])).verdict).toBe('excellent');
  });
});

describe('the founder’s regression cases', () => {
  it('a family-friendly park with some unknown facilities (Hampstead Heath: toilets and changing confirmed, no playground on record, parking and buggy access unknown) is Good, not Possible', () => {
    const m = gradeStored(threeAndBaby(['buggy']), 'hampsteadHeath').familyMatch!;
    expect(m.verdict).toBe('good');
    expect(m.headline).toBe('Likely good for Sloane, but check buggy access for Ozzie');
    expect(m.reasons.find((l) => l.inferred)?.text).toBe('A park usually gives a 3-year-old like Sloane space to run around; nothing child-specific is confirmed here yet');
    // Unknown parking is not a mark against; a park with NOTHING confirmed is still only Possible.
    expect(gradeStored(threeAndBaby(['buggy']), 'primroseHill').familyMatch!.verdict).toBe('possible');
  });

  it('a park with significant access limitations: difficult buggy access for a child who has no other way round is Not recommended; mixed access is Possible', () => {
    const difficult = read(synthetic('park', { playground: 'yes', pushchairSuitability: 'difficult' }), threeAndBaby(['buggy']));
    expect(difficult.verdict).toBe('poor');
    expect(difficult.headline).toBe('Not recommended for Ozzie');
    expect(matchBadgeText(difficult)).toBe('Not recommended');
    expect(texts(difficult.cautions)).toContain('Buggy access is difficult here, and Ozzie’s buggy is how you get around');
    const mixed = read(synthetic('park', { playground: 'yes', pushchairSuitability: 'mixed' }), threeAndBaby(['buggy']));
    expect(mixed.verdict).toBe('possible');
    expect(texts(mixed.cautions)).toContain('Buggy access is mixed here, so Ozzie’s buggy may be awkward in places');
    // The same place for a family that carries the baby: the limitation is about buggies, so it is not theirs, and the
    // playground, café, toilets and changing are: Excellent for them.
    expect(read(synthetic('park', { playground: 'yes', pushchairSuitability: 'difficult' }), threeAndBaby(['carrier'])).verdict).toBe('excellent');
  });

  it('a museum with no confirmed child-specific activities (Young V&A, as stored) is a Possible fit, with the exhibits named as the uncertainty', () => {
    const m = gradeStored(threeAndBaby(['carrier']), 'youngVA').familyMatch!;
    expect(m.verdict).toBe('possible');
    expect(m.headline).toBe('Easy to visit with Ozzie, but we haven’t yet confirmed whether the exhibits suit Sloane');
    expect(matchBadgeText(m)).toBe('Possible fit');
    expect(texts(m.toCheck)).toContain('We haven’t yet confirmed whether the exhibits suit Sloane');
    expect(m.reasons.some((l) => l.inferred)).toBe(false);
  });

  it('a museum with verified age-appropriate activities (the Science Museum’s reviewed Garden, ages 3 to 6) is Excellent for a four-year-old when everything practical is confirmed', () => {
    const SCIENCE_MUSEUM = 'fp-google-ChIJP9oAE0MFdkgR3iKGFKZO1SE';
    // Facilities are synthetic here; the activity evidence is the reviewed entry for this venue id (reviewed-activity-evidence.ts).
    const venue = synthetic('museum', { placeId: SCIENCE_MUSEUM, parking: 'yes', pushchairSuitability: 'good' });
    const m = read(venue, household([kid('c1', 'Kit', 4)]));
    expect(m.verdict).toBe('excellent');
    expect(m.headline).toBe('Excellent for Kit');
    expect(m.reasons[0].text).toMatch(/^The Garden: play-based science/);
    expect(m.reasons[0].inferred).toBeUndefined();
    // A two-year-old is not covered by that evidence: honest Possible, no inference fills the gap at a museum.
    expect(read(venue, household([kid('c1', 'Pip', 2)])).verdict).toBe('possible');
  });

  it('an indoor attraction with an explicit age restriction: a child the door policy does not admit makes it Not recommended; an age the venue merely recommends against is a caution', () => {
    const policy = { restrictions: [{ scope: 'venue', minMonthsInclusive: 48, maxMonthsExclusive: null, sourceUrl: 'https://example.invalid/terms', statedAs: 'Children under 4 are not admitted' }], caveats: [], sourcesDisagree: false };
    const restricted = read(synthetic('attraction', { venueAgePolicy: policy as never, pushchairSuitability: 'good' }), threeAndBaby(['buggy']));
    expect(restricted.verdict).toBe('poor');
    expect(texts(restricted.cautions)).toContain('Its age policy doesn’t admit Sloane and Ozzie');
    expect(matchBadgeText(restricted)).toBe('Not recommended');
    // The venue's own recommended ages: every child outside them is Not recommended (its own words), one of two is a caution.
    const onlyChildOutside = read(synthetic('attraction', { minRecommendedAge: 5, maxRecommendedAge: 12, pushchairSuitability: 'good' }), household([kid('c1', 'Sloane', 3)]));
    expect(onlyChildOutside.verdict).toBe('poor');
    const recommended = read(synthetic('attraction', { minRecommendedAge: 5, maxRecommendedAge: 12, pushchairSuitability: 'good' }), household([kid('c1', 'Sloane', 3), kid('c2', 'Max', 7)]));
    expect(recommended.verdict).toBe('possible');
    expect(texts(recommended.cautions)).toContain('Recommended from age 5, so Sloane is younger than that');
    expect(recommended.headline).toBe('Could work for Max, but check age range for Sloane');
    // Soft play: usually right for a 3-year-old, and the sentence itself says to check the limits on the day.
    const softPlay = read(synthetic('soft_play', { pushchairSuitability: 'good' }), household([kid('c1', 'Sloane', 3)]));
    expect(softPlay.verdict).toBe('good');
    expect(softPlay.reasons.find((l) => l.inferred)?.text).toBe('Soft play usually suits a 3-year-old like Sloane; check any age or height limits on the day');
  });

  it('a venue with excellent family suitability keeps its grade when a particular day’s plan runs into a nap: the planner says so, Family Fit does not', async () => {
    const family = threeAndBaby(['carrier']);
    const fit = gradeStored(family, 'goldersHill').familyMatch!;
    expect(fit.verdict).toBe('excellent');
    // The same family with a 13:00 nap at home, arriving at midday for two hours: the visit itself runs into the nap.
    const stored = STORED_VENUES.goldersHill;
    const facts = extractMatchableFacts(stored.id, stored.name, 'park', 20, 'enriched', stored.metadata, true);
    const anchor: PlanStopSource = { placeId: stored.id, name: stored.name, category: 'park', latitude: stored.latitude, longitude: stored.longitude, facts };
    const planningFamily: PlanningFamily = { id: 'mine', label: 'Our family', area: 'Camden', latitude: 51.539, longitude: -0.142, ages: [3, 0], maxDriveMinutes: 60, pushchair: false, required: [], routines: [{ id: 'nap', label: 'Nap', kind: 'nap', time: '13:00', durationMinutes: 90, atHome: true }] };
    const matrix: JourneyMatrix = { legs: { [homeKey('mine')]: { [stockKey(anchor)]: { minutes: 20, source: 'estimated' } }, [stockKey(anchor)]: { [homeKey('mine')]: { minutes: 20, source: 'estimated' } } } };
    const deps = { buildMatrix: vi.fn(async () => ({ matrix, provenance: { live: 0, estimated: 2 }, trafficDowngraded: false, missing: [] })) as unknown as typeof buildJourneyMatrix, now: new Date('2026-10-10T08:00:00Z') };
    const draft = { date: '2026-10-17', partyIds: ['mine'], attendeeIds: null, returnBy: '', bufferMinutes: 15, environment: 'either', startAt: '12:00', visit: 120 } as PlanDraft;
    const outcome = await createPlan({ venue: anchor, draft, families: [planningFamily], lunchAvailable: false }, deps);
    if (!outcome.ok) throw new Error(outcome.message);
    expect(outcome.source.itinerary.routineInsights.some((i) => i.routineId === 'nap')).toBe(true);
    expect(outcome.view.routines!.conflict).toMatchObject({ accepted: false });
    // Suitability has not moved: the fit reads no clock and no routine.
    expect(gradeStored({ ...family, routines: [{ id: 'nap', kind: 'nap', time: '13:00', durationMinutes: 90, atHome: true, childId: 'c2', label: 'Nap' }] } as unknown as FamilyProfile, 'goldersHill').familyMatch!.verdict).toBe('excellent');
  });
});

function stockKey(stop: PlanStopSource): string {
  return stopKey(stop.placeId);
}

describe('inference is always said as inference, and never invents a fact', () => {
  it('every inferred line says "usually", carries the flag, and no inference adds a facility, a reason about toilets, parking or changing, or a star-worthy confirmed fit', () => {
    for (const [, profile] of REPORT_HOUSEHOLDS) {
      for (const key of Object.keys(STORED_VENUES) as (keyof typeof STORED_VENUES)[]) {
        const m = gradeStored(profile, key).familyMatch!;
        for (const line of m.reasons) {
          if (line.inferred) {
            expect(line.text, `${key}: ${line.text}`).toMatch(/usually/);
            expect(line.aspect).toBe('activity');
          } else {
            expect(line.text).not.toMatch(/usually/);
          }
        }
        expect(m.suitedNames.every((n) => m.children.find((c) => c.name === n)?.basis === 'activity')).toBe(true);
        // A confirmed-nothing place is never Good; a Not recommended always has a confirmed reason.
        if (m.verdict === 'good' || m.verdict === 'excellent') expect(m.evidence.venueFacts, key).toBeGreaterThan(0);
        if (m.verdict === 'poor') expect(m.cautions.filter((c) => !c.note).length, key).toBeGreaterThan(0);
      }
    }
  });

  it('a confirmed "no parking" is a note for a family that never said it needs parking, and a breach for one that did', () => {
    const farm = gradeStored(household([kid('c1', 'Sloane', 3)]), 'hackneyFarm').familyMatch!;
    expect(farm.verdict).toBe('good');
    expect(farm.cautions.map((l) => [l.text, l.note])).toEqual([['No parking on site', true]]);
    const needsParking = gradeStored(household([kid('c1', 'Sloane', 3)], { mustHaveFacilities: ['parking'] }), 'hackneyFarm').familyMatch!;
    expect(needsParking.verdict).toBe('poor');
  });

  it('the venue’s own stated ages outrank the generic playground band: Battersea Park says 4 to 14, so a 3-year-old is uncertain there', () => {
    const m = gradeStored(threeAndBaby(['carrier']), 'batterseaPark').familyMatch!;
    expect(m.verdict).toBe('possible');
    expect(m.reasons.some((l) => /playground is confirmed here/.test(l.text))).toBe(false);
    expect(gradeStored(household([kid('c1', 'Sloane', 5)]), 'batterseaPark').familyMatch!.headline).toBe('Good for Sloane');
  });
});

describe('the note on a card for a place nobody has reviewed', () => {
  const unreviewed = { ...synthetic('soft_play', {}), id: 'fp-unreviewed', enrichmentStatus: 'provider_only' } as unknown as Venue;

  it('says what is still to be checked, and never repeats the journey time the card already shows', () => {
    const m = read(unreviewed, threeAndBaby(['buggy']));
    expect(m.verdict).toBe('not_reviewed');
    expect(matchCardReason(m)).toBe('Buggy access still to be checked for Ozzie’s buggy');
    expect(matchCardReason(read(unreviewed, household([kid('c1', 'Sloane', 4)])))).not.toMatch(/min away/);
  });
});
