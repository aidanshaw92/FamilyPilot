import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { evaluateFamilyMatch } from '@/src/services/matching/family-match';
import { extractMatchableFacts } from '@/src/services/matching/venue-facts';
import { ChildMobility, FamilyMember, FamilyProfile, Venue } from '@/src/types';
import { MatchableVenueFacts } from '@/src/types/day-request';
import { MOBILITY_LABELS } from '@/src/utils/family-mobility';

/**
 * Buggy / pushchair and Sling / baby carrier: clearer words, and advice only where the evidence supports it.
 *
 * The terminology is display-only (stored values stay `buggy` and `carrier`). The advice is pinned to its evidence: an
 * approved buggy-access fact or an approved terrain fact. Never the category, never visit length, never parent reports
 * alone, never unknown. With nothing to go on, nothing is said.
 */

const NOW = new Date(2026, 9, 6, 11, 0, 0);
const child = (id: string, name: string, months: number, mobility: ChildMobility[]): FamilyMember => ({
  id, name, role: 'child', dateOfBirth: '', age: Math.floor(months / 12), ageMonths: months < 24 ? months : null, dobKnown: true, mobility,
});
const profile = (...kids: FamilyMember[]): FamilyProfile => ({
  id: 'f', parentName: 'Aidan', members: [{ id: 'p', name: 'Aidan', role: 'parent', dateOfBirth: '', age: 38 }, ...kids],
  homeLocation: 'NW7', budgetTier: 'moderate', maxDriveMinutes: 45, completionPercent: 100, mustHaveFacilities: [], routines: [],
} as unknown as FamilyProfile);

const facts = (over: Partial<MatchableVenueFacts> = {}): MatchableVenueFacts => ({
  placeId: 'fp-x', name: 'Trent Park', category: 'park', driveMinutes: 20, enrichmentStatus: 'enriched',
  minRecommendedAge: 0, maxRecommendedAge: 12, venueAgePolicy: null,
  toilets: 'yes', babyChanging: 'yes', parking: 'yes', pushchairSuitability: 'unknown', terrain: 'unknown',
  environment: 'outdoor', energyLevel: 'moderate', visitDurationMinutes: 240, estimatedSpend: 'Free',
  goodToKnow: [], warnings: [], openingStatus: 'open', ...over,
});

const OPEN = { timezone: 'Europe/London', periods: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ open: { day: d, hour: 0, minute: 0 }, close: { day: d, hour: 23, minute: 59 } })) };
const run = (p: FamilyProfile, f: MatchableVenueFacts, parentObservations = {}) =>
  evaluateFamilyMatch({
    venue: { id: 'fp-x', name: 'Trent Park', category: 'park', driveMinutes: 20, enrichmentStatus: 'enriched', trustedFacts: f, structuredOpeningHours: OPEN, facilities: [] } as unknown as Venue,
    profile: p, score: 85, now: NOW, parentObservations,
  });
const lines = (r: ReturnType<typeof run>) => [...r.reasons, ...r.cautions, ...r.toCheck].map((l) => l.text);
const advice = (r: ReturnType<typeof run>) => lines(r).filter((t) => /sling or carrier/i.test(t));

const OZZIE_BOTH = child('c2', 'Ozzie', 7, ['buggy', 'carrier']);
const OZZIE_BUGGY = child('c2', 'Ozzie', 7, ['buggy']);
const OZZIE_SLING = child('c2', 'Ozzie', 7, ['carrier']);
const SLOANE = child('c1', 'Sloane', 48, ['walks']);

describe('the words', () => {
  it('Buggy / pushchair and Sling / baby carrier, everywhere the answers are shown', () => {
    expect(MOBILITY_LABELS.buggy).toBe('Buggy / pushchair');
    expect(MOBILITY_LABELS.carrier).toBe('Sling / baby carrier');
    for (const file of ['src/components/onboarding/MobilityPicker.tsx', 'app/(tabs)/profile.tsx', 'src/components/profile/FamilySections.tsx']) {
      expect(readFileSync(join(__dirname, '..', '..', file), 'utf8'), file).toContain('MOBILITY_LABELS');
    }
  });

  it('only the words changed: the stored answers are still buggy and carrier', () => {
    expect(Object.keys(MOBILITY_LABELS).sort()).toEqual(['buggy', 'carrier', 'mobility-aid', 'walks']);
  });
});

describe('when the evidence supports it, it is said, for the right child', () => {
  it('buggy access confirmed difficult, Ozzie goes in both: the sling is suggested, and the place is not ruled out', () => {
    const r = run(profile(SLOANE, OZZIE_BOTH), facts({ pushchairSuitability: 'difficult' }));
    expect(advice(r)).toEqual(['A sling or carrier may be easier for Ozzie: buggy access is difficult here']);
    expect(r.verdict).not.toBe('poor');
  });

  it('buggy access confirmed mixed: suggested', () => {
    expect(advice(run(profile(OZZIE_BOTH), facts({ pushchairSuitability: 'mixed' })))).toEqual(['A sling or carrier may be easier for Ozzie: buggy access is mixed here']);
  });

  it('approved hilly terrain, buggy access not confirmed: suggested, saying why', () => {
    expect(advice(run(profile(OZZIE_BOTH), facts({ terrain: 'very_hilly' })))).toEqual(['A sling or carrier may be easier for Ozzie: the paths here are very hilly']);
  });

  it('buggy confirmed good: "Good buggy access", and no sling advice', () => {
    const r = run(profile(OZZIE_BOTH), facts({ pushchairSuitability: 'good', terrain: 'flat' }));
    expect(lines(r)).toContain('Good buggy access for Ozzie’s buggy');
    expect(advice(r)).toEqual([]);
  });

  it('several children: only the child who goes in both is named', () => {
    const theo = child('c3', 'Theo', 20, ['buggy', 'carrier']);
    expect(advice(run(profile(SLOANE, OZZIE_BOTH, theo), facts({ pushchairSuitability: 'mixed' })))).toEqual(['A sling or carrier may be easier for Ozzie and Theo: buggy access is mixed here']);
  });
});

describe('when it does not, nothing is said', () => {
  it('no evidence (a park with a long visit): silence, never "lots of walking"', () => {
    const r = run(profile(OZZIE_BOTH), facts());
    expect(advice(r)).toEqual([]);
    expect(lines(r).join(' ')).not.toMatch(/lots of walking|uneven|rough|terrain|hilly/i);
  });

  it('the category alone never counts: a zoo, a farm, a museum with nothing recorded', () => {
    for (const category of ['zoo', 'farm', 'museum', 'attraction']) {
      expect(advice(run(profile(OZZIE_BOTH), facts({ category }))), category).toEqual([]);
    }
  });

  it('conflicting evidence (buggy confirmed good, paths hilly): nothing either way', () => {
    expect(advice(run(profile(OZZIE_BOTH), facts({ pushchairSuitability: 'excellent', terrain: 'hilly' })))).toEqual([]);
  });

  it('parent reports alone are not evidence for it', () => {
    const r = run(profile(OZZIE_BOTH), facts(), { pushchair: { basis: 'parent_corroborated', families: 3, observed: ['difficult'], hadOfficial: false } });
    expect(advice(r)).toEqual([]);
  });

  it('buggy only: the buggy is talked about, a sling is not suggested', () => {
    const r = run(profile(OZZIE_BUGGY), facts({ pushchairSuitability: 'difficult' }));
    expect(advice(r)).toEqual([]);
    expect(r.verdict).toBe('poor');
    expect(lines(r)).toContain('Buggy access is difficult here, and Ozzie’s buggy is how you get around');
  });

  it('sling only: nothing to choose between, so nothing to suggest', () => {
    expect(advice(run(profile(OZZIE_SLING), facts({ pushchairSuitability: 'difficult', terrain: 'very_hilly' })))).toEqual([]);
  });

  it('neither: nothing', () => {
    expect(advice(run(profile(SLOANE), facts({ pushchairSuitability: 'difficult', terrain: 'very_hilly' })))).toEqual([]);
  });
});

describe('terrain comes only from the approved claim', () => {
  it('extendedTerrain is read; the editorial terrain words are not', () => {
    const metadata = { enrichmentStatus: 'enriched', extendedTerrain: 'hilly', terrain: 'flat', terrainNotes: 'lots of walking' } as never;
    expect(extractMatchableFacts('fp', 'X', 'park', 10, 'enriched', metadata).terrain).toBe('hilly');
    const editorialOnly = { enrichmentStatus: 'enriched', terrain: 'hilly', terrainNotes: 'very hilly' } as never;
    expect(extractMatchableFacts('fp', 'X', 'park', 10, 'enriched', editorialOnly).terrain).toBe('unknown');
  });
});
