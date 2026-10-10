import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'vitest';

import { matchVenueToDayRequest } from '@/src/services/matching/day-request-matcher';
import { planningFamilyFromProfile } from '@/src/services/planning/plan-parties';
import { familyRequest } from '@/src/services/planning/planner';
import { SequenceOptions, homeKey, sequenceDay, stopKey } from '@/src/services/planning/sequencer';
import { rankForFamily } from '@/src/services/places/home-list';
import { mergePlaceToVenue } from '@/src/services/places/merge-place';
import { CURRENT_POLICY, PROPOSED_POLICY } from '@/src/services/scoring/fit-policy';
import type { StopRequest } from '@/src/types/day-sequence';
import type { Venue } from '@/src/types';
import type { ExternalPlaceRecord } from '@/src/types/places';
import { extractMatchableFacts } from '@/src/services/matching/venue-facts';

import { HOUSEHOLDS, profileFor } from './helpers/pilot-households';

/**
 * NOT a unit test: an experiment harness, skipped unless PILOT_FIXTURE_DIR and FIT_V2_OUT are set. It ranks the pilot venues for
 * the nine households under the CURRENT policy and the PROPOSED one (docs/pilot/FAMILY_FIT_V2.md), in each evidence state, and
 * asks the planner's own sequencer whether each venue would be refused for the same household. It asserts nothing and changes
 * nothing; nothing here switches a policy on anywhere else.
 */
const DIR = process.env.PILOT_FIXTURE_DIR;
const OUT = process.env.FIT_V2_OUT;
const NOW = new Date('2026-10-08T12:00:00Z');

function plannerVerdict(venue: Venue, profile: ReturnType<typeof profileFor>) {
  const family = planningFamilyFromProfile(profile);
  if (typeof family === 'string') return { refused: false, why: 'no-family' as const };
  const facts = venue.trustedFacts ?? extractMatchableFacts(venue.id, venue.name, venue.category, venue.driveMinutes, venue.enrichmentStatus, null);
  const request: StopRequest = { placeId: venue.id, name: venue.name, role: 'activity', anchor: true, dwellMinutes: 90, facts: { ...facts, driveMinutes: 10 } };
  // A short drive and no drive limit: this asks about the household's non-negotiables, not about distance or a particular date.
  const near = { ...family, maxDriveMinutes: undefined };
  const matrix = { legs: { [homeKey(near.id)]: { [stopKey(venue.id)]: { minutes: 10, source: 'estimated' as const } }, [stopKey(venue.id)]: { [homeKey(near.id)]: { minutes: 10, source: 'estimated' as const } } } };
  const options = { date: '2026-11-10', leaveAt: '09:00', arriveAt: '10:30', returnBy: '', bufferMinutes: 15, environment: 'either' } as SequenceOptions;
  const result = sequenceDay([request], [near], matrix, options, NOW);
  if (result.ok) return { refused: false, why: 'ok' as const };
  const failure = result.failure.reason === 'no-feasible-sequence' && result.failure.nearest ? result.failure.nearest : result.failure;
  return { refused: failure.reason === 'requirement-unmet', why: failure.reason as string, fields: JSON.stringify(failure) };
}

describe.skipIf(!DIR || !OUT)('Family Fit v2 experiment', () => {
  it('compares current and proposed policy for the nine households and checks Home against the planner', () => {
    const result: Record<string, unknown> = { households: HOUSEHOLDS.map(({ key, label, limit, home }) => ({ key, label, limit, home: home.name })), states: {} };
    for (const state of ['before', 'afterAuto', 'after'] as const) {
      const places = JSON.parse(fs.readFileSync(path.join(DIR!, `pilot-${state}.json`), 'utf8')) as ExternalPlaceRecord[];
      const perHousehold: Record<string, unknown> = {};
      for (const h of HOUSEHOLDS) {
        const profile = profileFor(h);
        const venues = places.map((p) => mergePlaceToVenue(p, p.familyMetadata ?? null, h.home.lat, h.home.lng));
        const describe = (v: Venue, rank: number) => ({
          rank, id: v.id, name: v.name, score: v.familyScore.score, drive: v.driveMinutes, factors: v.familyScore.factors, basis: v.familyScore.basis ?? null,
          verdict: v.familyMatch?.verdict, headline: v.familyMatch?.headline, conflicts: v.fitConflicts ?? [], enrichment: v.enrichmentStatus,
          cautions: v.familyScore.cautions ?? [], closedToday: v.familyMatch?.availableToday === false,
        });
        // Two places read the policy from the environment (the matcher's parking rule and the label code), so the switch is
        // set for the proposed run and cleared for the current one.
        const withEnv = <T,>(value: string | undefined, fn: () => T): T => {
          const was = process.env.EXPO_PUBLIC_FAMILY_FIT_V2;
          if (value === undefined) delete process.env.EXPO_PUBLIC_FAMILY_FIT_V2; else process.env.EXPO_PUBLIC_FAMILY_FIT_V2 = value;
          try { return fn(); } finally { if (was === undefined) delete process.env.EXPO_PUBLIC_FAMILY_FIT_V2; else process.env.EXPO_PUBLIC_FAMILY_FIT_V2 = was; }
        };
        const current = withEnv(undefined, () => rankForFamily(venues, profile, CURRENT_POLICY).map((v, i) => describe(v, i + 1)));
        const proposed = withEnv('all', () => rankForFamily(venues, profile, PROPOSED_POLICY).map((v, i) => describe(v, i + 1)));
        // Consistency: the planner's refusal (requirements only) against what Home knows.
        const consistency = withEnv('all', () => rankForFamily(venues, profile, PROPOSED_POLICY).map((v) => {
          const planner = plannerVerdict(v, profile);
          const conflicts = (v.fitConflicts ?? []).length > 0;
          return { name: v.name, verdict: v.familyMatch?.verdict, homeConflict: conflicts, plannerRefused: planner.refused, plannerWhy: planner.why, fields: (v.fitConflicts ?? []).map((c) => c.field) };
        }));
        perHousehold[h.key] = { current, proposed, consistency };
      }
      (result.states as Record<string, unknown>)[state] = perHousehold;
    }
    fs.mkdirSync(path.dirname(OUT!), { recursive: true });
    fs.writeFileSync(OUT!, JSON.stringify(result, null, 1));
  });
});
