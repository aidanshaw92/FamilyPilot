import { estimateDriveMinutes } from '@/src/services/places/geo-utils';
import { extractMatchableFacts } from '@/src/services/matching/venue-facts';
import { Journey, PlanMatch, PlanningFamily, PlanningOptions, planVenue } from '@/src/services/planning/planner';
import { MatchableVenueFacts } from '@/src/types/day-request';
import { FamilyProfile, Venue, VenueDetail } from '@/src/types';

/**
 * Builds a day plan around one chosen place using the same scheduler the multi-family
 * planner uses, so a plan created from a place detail page obeys exactly the same routine,
 * age and travel rules. Returns null when the facts do not support a confident plan;
 * callers must not paper over that.
 */
export function buildPlanForVenue(
  venue: Venue | VenueDetail,
  families: PlanningFamily[],
  options: PlanningOptions,
  now = new Date(),
): PlanMatch | null {
  if (!families.length) return null;

  const journeys: Record<string, Journey> = {};
  for (const family of families) {
    // Straight-line estimate, clearly labelled as such everywhere it surfaces.
    const minutes = estimateDriveMinutes(
      family.latitude,
      family.longitude,
      venue.latitude,
      venue.longitude,
    );
    journeys[family.id] = { outbound: minutes, inbound: minutes, source: 'estimated' };
  }

  const primaryDrive = journeys[families[0].id]?.outbound ?? venue.driveMinutes;
  const facts: MatchableVenueFacts = venue.trustedFacts
    ? { ...venue.trustedFacts, driveMinutes: primaryDrive }
    : extractMatchableFacts(
        venue.id,
        venue.name,
        venue.category,
        primaryDrive,
        venue.enrichmentStatus,
        null,
        venue.isOpen,
      );

  return planVenue(facts, families, journeys, options, now);
}

/** A planning family seeded from the household profile, used when a parent creates a plan
 * before they have set anything up under Families. Ages, home and pushchair are facts from
 * the profile, never invented here. */
export function planningFamilyFromProfile(
  profile: FamilyProfile,
  home: { latitude: number; longitude: number },
): PlanningFamily {
  return {
    id: 'mine',
    label: 'Our family',
    area: profile.homeLocation,
    latitude: home.latitude,
    longitude: home.longitude,
    ages: profile.members.filter((m) => m.role === 'child').map((m) => m.age),
    maxDriveMinutes: profile.maxDriveMinutes,
    budgetTier: profile.budgetTier,
    pushchair: Boolean(profile.pushchair),
    required: [],
    routines: (profile.routines ?? []).map((r) => ({ ...r })),
  };
}
