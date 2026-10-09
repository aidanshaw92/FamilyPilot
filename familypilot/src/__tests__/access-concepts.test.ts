import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  ACCESS_CONCEPTS,
  confirmedAccessConflicts,
  householdAccessNeeds,
  needOutcome,
  stepFreeOutcome,
  venueAccess,
} from '@/src/services/access/access-concepts';
import { extractMatchableFacts } from '@/src/services/matching/venue-facts';
import { evaluateFamilyMatch } from '@/src/services/matching/family-match';
import { PROPOSED_POLICY } from '@/src/services/scoring/fit-policy';
import { familyEssentialRows } from '@/src/utils/family-essentials';
import { personaliseVenue } from '@/src/utils/personalise-venues';
import type { FamilyProfile, TransportNeeds, Venue, VenueDetail } from '@/src/types';
import type { MatchableVenueFacts } from '@/src/types/day-request';
import { NOW, facts, home, kid, plannerRefuses, profile } from './helpers/surfaces';

/**
 * Access and getting-there concepts: each defined once, each answered from its own claim, and the same answer on every surface.
 *
 * The matrix below is the test that matters. For every household and every combination of venue evidence it computes the answer
 * FROM FIRST PRINCIPLES (the oracle) and requires Home and Explore (the conflict list and the "Probably not" badge) and Create a
 * Plan (the sequencer refusing the day) to agree with it, with no help from the module under test.
 */
beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); });
afterAll(() => { vi.useRealTimers(); });

type Tri = 'yes' | 'no' | 'unknown';
const TRI: Tri[] = ['yes', 'no', 'unknown'];
const aid = kid('c', 'Ida', 7, { mobility: ['mobility-aid'] });
const walker = kid('w', 'Cal', 7);

interface Household { name: string; profile: FamilyProfile; needs: { parking: boolean; blueBadge: boolean; stepFree: boolean; station: boolean; publicTransport: boolean } }
const none = { parking: false, blueBadge: false, stepFree: false, station: false, publicTransport: false };
const transport = (t: TransportNeeds): Partial<FamilyProfile> => ({ transportNeeds: t });
const HOUSEHOLDS: Household[] = [
  { name: 'wheelchair user, nothing else asked', profile: profile([aid]), needs: { ...none, stepFree: true } },
  { name: 'wheelchair user who also asked for parking', profile: profile([aid], { mustHaveFacilities: ['parking'] }), needs: { ...none, stepFree: true, parking: true } },
  { name: 'wheelchair user who asked for Blue Badge parking', profile: profile([aid], { mustHaveFacilities: ['blue_badge_parking'] }), needs: { ...none, stepFree: true, blueBadge: true } },
  { name: 'walking family that asked for parking', profile: profile([walker], { mustHaveFacilities: ['parking'] }), needs: { ...none, parking: true } },
  { name: 'walking family that asked for Blue Badge parking', profile: profile([walker], { mustHaveFacilities: ['blue_badge_parking'] }), needs: { ...none, blueBadge: true } },
  { name: 'walking family with a car and nothing asked', profile: profile([walker], { vehicle: 'estate' }), needs: none },
  { name: 'wheelchair user who asked for both kinds of parking', profile: profile([aid], { mustHaveFacilities: ['parking', 'blue_badge_parking'] }), needs: { ...none, stepFree: true, parking: true, blueBadge: true } },
];

/** What a person would conclude, written without the module under test. */
function oracle(h: Household, v: { parking: Tri; blueBadge: Tri; stepFree: Tri; wheelchair: Tri }): boolean {
  const stepFreeReadings = [v.stepFree, v.wheelchair];
  const stepFreeFails = stepFreeReadings.includes('no') && !stepFreeReadings.includes('yes');
  return (
    (h.needs.parking && v.parking === 'no') ||
    (h.needs.blueBadge && v.blueBadge === 'no') ||
    (h.needs.stepFree && stepFreeFails)
  );
}

describe('every surface gives the oracle’s answer for every household and every combination of evidence', () => {
  const cases: Array<[string, Household, Tri, Tri, Tri, Tri]> = [];
  for (const h of HOUSEHOLDS) {
    for (const parking of TRI) for (const blueBadge of TRI) for (const stepFree of TRI) for (const wheelchair of TRI) {
      cases.push([`${h.name} | parking ${parking}, Blue Badge ${blueBadge}, step-free ${stepFree}, wheelchair ${wheelchair}`, h, parking, blueBadge, stepFree, wheelchair]);
    }
  }
  it(`${cases.length} combinations agree`, () => {
    const wrong: string[] = [];
    for (const [name, h, parking, blueBadge, stepFree, wheelchair] of cases) {
      const f = facts({ parking, blueBadgeParking: blueBadge, stepFreeAccess: stepFree, wheelchairAccessible: wheelchair, toilets: 'yes' });
      const expected = oracle(h, { parking, blueBadge, stepFree, wheelchair });
      const onHome = home(f, h.profile);
      const answers = {
        module: confirmedAccessConflicts(f, h.profile).length > 0,
        homeConflict: onHome.conflict,
        homeBadge: onHome.poor,
        planner: plannerRefuses(f, h.profile),
      };
      for (const [surface, got] of Object.entries(answers)) if (got !== expected) wrong.push(`${name}: ${surface} said ${got}, expected ${expected}`);
    }
    expect(wrong).toEqual([]);
  });
});

describe('transport needs: their own concept, required versus preferred', () => {
  const walkerWith = (t: TransportNeeds) => profile([walker], transport(t));
  const cases: Array<[string, TransportNeeds, Partial<MatchableVenueFacts>, boolean]> = [
    ['required step-free station, station confirmed step-free', { stepFreeStation: 'required' }, { stepFreeStation: 'yes' }, false],
    ['required step-free station, station confirmed NOT step-free', { stepFreeStation: 'required' }, { stepFreeStation: 'no' }, true],
    ['required step-free station, nobody has confirmed', { stepFreeStation: 'required' }, {}, false],
    ['preferred step-free station, confirmed not: a preference never refuses', { stepFreeStation: 'preferred' }, { stepFreeStation: 'no' }, false],
    ['required public transport, confirmed unreachable', { publicTransport: 'required' }, { publicTransport: 'no' }, true],
    ['required public transport, confirmed reachable', { publicTransport: 'required' }, { publicTransport: 'yes' }, false],
    ['required public transport: a car park proves nothing about it', { publicTransport: 'required' }, { parking: 'yes' }, false],
    ['required step-free station: general parking "no" proves nothing about it', { stepFreeStation: 'required' }, { parking: 'no' }, false],
  ];
  it.each(cases)('%s', (_name, needs, over, conflict) => {
    const p = walkerWith(needs);
    const f = facts({ toilets: 'yes', ...over });
    expect(confirmedAccessConflicts(f, p).length > 0).toBe(conflict);
    expect(home(f, p).conflict).toBe(conflict);
    expect(plannerRefuses(f, p)).toBe(conflict);
  });
});

describe('what a household needs: only what it said', () => {
  it('a mobility aid is a step-free need and nothing else', () => {
    expect(householdAccessNeeds(profile([aid])).map((n) => n.concept)).toEqual(['step_free_access']);
  });
  it('a car, a buggy or a free-text vehicle are not parking, step-free or transport needs', () => {
    const buggy = kid('b', 'Hal', 2, { mobility: ['buggy'] });
    expect(householdAccessNeeds(profile([buggy], { vehicle: 'estate', pushchair: 'x' }))).toEqual([]);
  });
  it('parking and Blue Badge parking are separate needs, each only if stated', () => {
    expect(householdAccessNeeds(profile([walker], { mustHaveFacilities: ['parking'] })).map((n) => n.concept)).toEqual(['general_parking']);
    expect(householdAccessNeeds(profile([walker], { mustHaveFacilities: ['blue_badge_parking'] })).map((n) => n.concept)).toEqual(['blue_badge_parking']);
  });
  it('transport needs carry their strength and are independent of each other', () => {
    const needs = householdAccessNeeds(profile([walker], transport({ stepFreeStation: 'required', publicTransport: 'preferred' })));
    expect(needs).toEqual([
      { concept: 'step_free_station', strength: 'required', source: 'transport_need' },
      { concept: 'public_transport', strength: 'preferred', source: 'transport_need' },
    ]);
  });
});

describe('evidence: each concept is answered from its own claim only', () => {
  it('Blue Badge parking is never derived from general parking, in either direction', () => {
    expect(venueAccess(facts({ parking: 'yes' })).blue_badge_parking).toBe('unknown');
    expect(venueAccess(facts({ parking: 'no' })).blue_badge_parking).toBe('unknown');
    expect(venueAccess(facts({ blueBadgeParking: 'yes' })).general_parking).toBe('unknown');
    expect(needOutcome({ concept: 'blue_badge_parking', strength: 'required', source: 'must_have' }, venueAccess(facts({ parking: 'yes' })))).toBe('unknown');
    expect(needOutcome({ concept: 'general_parking', strength: 'required', source: 'must_have' }, venueAccess(facts({ blueBadgeParking: 'yes' })))).toBe('unknown');
  });
  it('step-free access is never derived from parking or a buggy rating', () => {
    expect(stepFreeOutcome(venueAccess(facts({ parking: 'no', pushchairSuitability: 'good' })))).toBe('unknown');
    expect(stepFreeOutcome(venueAccess(facts({ parking: 'yes', pushchairSuitability: 'difficult' })))).toBe('unknown');
  });
  it('pushchair access is not wheelchair access, in either direction', () => {
    expect(venueAccess(facts({ pushchairSuitability: 'good' })).wheelchair_access).toBe('unknown');
    expect(venueAccess(facts({ wheelchairAccessible: 'yes' })).pushchair_access).toBe('unknown');
  });
  it('a step-free entrance or a wheelchair claim meets a step-free need; a disagreement is unknown, never a side', () => {
    expect(stepFreeOutcome(venueAccess(facts({ stepFreeAccess: 'yes' })))).toBe('met');
    expect(stepFreeOutcome(venueAccess(facts({ wheelchairAccessible: 'yes' })))).toBe('met');
    expect(stepFreeOutcome(venueAccess(facts({ stepFreeAccess: 'yes', wheelchairAccessible: 'no' })))).toBe('unknown');
    expect(stepFreeOutcome(venueAccess(facts({ stepFreeAccess: 'no' })))).toBe('unmet');
  });
  it('every concept names the claim it is read from and what it is not inferred from', () => {
    for (const [concept, definition] of Object.entries(ACCESS_CONCEPTS)) {
      expect(definition.claimKey, concept).toBeTruthy();
      expect(definition.notInferredFrom.length, concept).toBeGreaterThan(0);
      expect(definition.notInferredFrom, concept).not.toContain(concept);
    }
  });
});

describe('reading the venue’s claims', () => {
  const read = (extra: Record<string, unknown>) =>
    extractMatchableFacts('fp-x', 'X', 'museum', 10, 'enriched', { familypilotPlaceId: 'fp-x', provenance: {}, enrichmentStatus: 'enriched', ...extra } as never);

  it('Blue Badge parking reads accessible-parking or disabled-bay claims, and never general parking', () => {
    expect(read({ accessibility: { accessibleParking: 'yes' } }).blueBadgeParking).toBe('yes');
    expect(read({ accessibility: { disabledParkingBays: 'yes' } }).blueBadgeParking).toBe('yes');
    expect(read({ accessibility: { accessibleParking: 'no', disabledParkingBays: 'yes' } }).blueBadgeParking).toBe('yes');
    expect(read({ accessibility: { accessibleParking: 'no' } }).blueBadgeParking).toBe('no');
    expect(read({ familyFacilities: { parking: 'no' } }).blueBadgeParking).toBe('unknown');
    expect(read({ familyFacilities: { parking: 'yes' } }).blueBadgeParking).toBe('unknown');
  });
  it('the venue with no car park and Blue Badge bays: parking no, Blue Badge yes, neither inferred from the other', () => {
    const f = read({ familyFacilities: { parking: 'no' }, accessibility: { accessibleParking: 'yes' } });
    expect(f.parking).toBe('no');
    expect(f.blueBadgeParking).toBe('yes');
    expect(f.wheelchairAccessible).toBe('unknown');
  });
  it('step-free access and transport come from their own claims; an unreviewed venue reads everything as unknown', () => {
    const f = read({ accessibility: { stepFreeEntrance: 'yes' }, transport: { stepFreeStation: 'no', publicTransport: 'yes' } });
    expect(f).toMatchObject({ stepFreeAccess: 'yes', stepFreeStation: 'no', publicTransport: 'yes', wheelchairAccessible: 'unknown' });
    const unreviewed = extractMatchableFacts('fp-x', 'X', 'museum', 10, 'provider_only', null);
    expect(unreviewed).toMatchObject({ blueBadgeParking: 'unknown', stepFreeAccess: 'unknown', stepFreeStation: 'unknown', publicTransport: 'unknown' });
  });
});

describe('Venue Detail says it in the same terms', () => {
  const venueOf = (f: MatchableVenueFacts): Venue =>
    ({ id: 'fp-x', name: 'Test Place', category: 'museum', latitude: 51.5, longitude: -0.1, driveMinutes: 10, imageUrl: '', familyScore: { score: 0, factors: {} as never, explanation: [] }, enrichmentStatus: 'enriched', facilities: [], trustedFacts: f } as unknown as Venue);
  const essentials = (f: MatchableVenueFacts) => Object.fromEntries(familyEssentialRows({ ...venueOf(f), photos: [], openingHours: '', description: '' } as unknown as VenueDetail).map((r) => [r.key, r]));

  it('a venue with no car park and Blue Badge bays shows both truthfully, as two rows', () => {
    const rows = essentials(facts({ parking: 'no', blueBadgeParking: 'yes' }));
    expect(rows.parking).toMatchObject({ value: 'None on site', confirmed: true });
    expect(rows['blue-badge']).toMatchObject({ value: 'Available', confirmed: true });
  });
  it('a car park does not turn the Blue Badge row on', () => {
    expect(essentials(facts({ parking: 'yes' }))['blue-badge']).toMatchObject({ confirmed: false });
  });
  it('the "you said you need" sentence names what was stated and what was found', () => {
    const p = profile([aid], { mustHaveFacilities: ['blue_badge_parking'] });
    const miss = evaluateFamilyMatch({ venue: venueOf(facts({ blueBadgeParking: 'no', toilets: 'yes' })), profile: p, score: 70 });
    expect(JSON.stringify(miss)).toContain('No Blue Badge parking here, and you said you need it');
    const unknown = evaluateFamilyMatch({ venue: venueOf(facts({ parking: 'no', toilets: 'yes' })), profile: p, score: 70 });
    expect(JSON.stringify(unknown)).not.toContain('No Blue Badge parking here');
    // "No parking on site" may be said as the plain fact it is; it is never a failed need, because they did not ask for it.
    expect(JSON.stringify(unknown)).not.toContain('No parking here, and you said');
    expect((unknown.toCheck ?? []).map((c) => c.text).join(' ')).toContain('Blue Badge parking, which you said you need, still to be checked');
  });
  it('the Home card does not call a wheelchair family’s venue "Missing parking" when they never asked for parking', () => {
    const v = personaliseVenue(venueOf(facts({ parking: 'no', blueBadgeParking: 'yes', wheelchairAccessible: 'yes' })), profile([aid]), undefined, PROPOSED_POLICY);
    // The venue's plain fact may appear ("Parking reviewed as not available on site"); a failed need may not.
    expect((v.familyScore.cautions ?? []).join(' ')).not.toMatch(/missing parking|which you said you need/i);
    expect(v.fitConflicts ?? []).toEqual([]);
  });
});
