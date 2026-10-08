import { mockVenueDetails, mockVenues } from '@/src/data/mock-data';
import { driveLimitMinutes } from '@/src/utils/preferences';
import { calculateFamilyScore } from '@/src/services/scoring/family-score';
import { evaluateFamilyMatch } from '@/src/services/matching/family-match';
import { hardConflictsFor } from '@/src/services/matching/hard-conflicts';
import type { ParentObservations } from '@/src/services/matching/parent-observations';
import { EnrichmentStatus, FamilyProfile, RecommendationSection, Venue, VenueDetail } from '@/src/types';

import { compareVenuesForFamily } from '@/src/services/places/fit-order';
import { getChildNames } from './profile-defaults';
import { buildConfirmedMissingCaution, buildFacilityMissingCaution } from './facility-match';
import { activeFitPolicy, type FitPolicy } from '@/src/services/scoring/fit-policy';
import type { FacilityType } from '@/src/types';
import { familyNeedsStepFree } from './family-mobility';

/**
 * The drive is longer than the limit in use. That limit starts as a default (onboarding no longer asks
 * for it), so the wording is "the drive we're using", never "your usual", which would claim a habit the
 * parent never described.
 *
 * Lived in family-score's REASONS until a render showed it under "Why it suits your family" with a
 * tick beside it. It is the opposite of a reason. Guarded on a finite number because a place restored
 * from a cloud backup has no drive time yet, and "further than your drive" about an unknown
 * distance would be a second fabrication.
 */
export function buildDriveCaution(profile: FamilyProfile, driveMinutes: number): string | null {
  // Only a limit the family stated: with none there is nothing to be further than.
  const limit = driveLimitMinutes(profile);
  if (!Number.isFinite(driveMinutes) || limit === null) return null;
  if (driveMinutes <= limit) return null;
  return `Further than the ${limit} min drive we’re using`;
}

/**
 * A child who uses a mobility aid makes step-free and wheelchair access matter, and the app holds no such
 * evidence to show a parent (it is collected internally and is not part of the facts a venue is matched
 * on). So the honest statement is that it is unknown, shown only to families it matters to. It is worded
 * about wheelchairs and mobility aids on purpose: Venue Detail's "Mostly step-free" row is a reading of
 * pushchair access, and a caution that said only "step-free isn't confirmed" would contradict it. Never a
 * score and never a "yes": wheelchair evidence must not be read as buggy-suitable, or the reverse.
 */
export function buildStepFreeCaution(profile: FamilyProfile): string | null {
  return familyNeedsStepFree(profile) ? 'Wheelchair and mobility-aid access isn’t confirmed here' : null;
}

/** The facilities the venue is CONFIRMED not to have (a claim says no), as opposed to the ones nobody has confirmed. */
function confirmedAbsentFacilities(venue: Venue, stepFreeParty: boolean): FacilityType[] {
  const f = venue.trustedFacts;
  const absent: FacilityType[] = [];
  if (f?.toilets === 'no') absent.push('toilets');
  if (f?.babyChanging === 'no') absent.push('baby_changing');
  if (f?.parking === 'no' && !stepFreeParty) absent.push('parking');
  return absent;
}

function toVenueDetail(venue: Venue): VenueDetail {
  const existing = mockVenueDetails[venue.id];
  // The legacy fixture's own driveMinutes/explanation are stale for whichever home
  // location is actually configured — always score against the venue's live-computed
  // distance so "X minutes from home" can't disagree with what the rest of the screen shows.
  if (existing) return { ...existing, driveMinutes: venue.driveMinutes };

  if (venue.enrichmentStatus === 'provider_only') {
    return {
      ...venue,
      photos: venue.imageUrl ? [venue.imageUrl] : [],
      facilities: [],
      openingHours: 'Opening hours not confirmed',
      description: `${venue.name}: family suitability has not yet been reviewed.`,
    };
  }

  return {
    ...venue,
    photos: venue.imageUrl ? [venue.imageUrl] : [],
    facilities: venue.facilities ?? [],
    openingHours: 'Opening hours not confirmed',
    description: `${venue.name} is worth considering for your next outing.`,
  };
}

export function personaliseVenue(venue: Venue, profile: FamilyProfile, parentObservations?: ParentObservations, policy?: FitPolicy): Venue {
  const detail = toVenueDetail(venue);
  const enrichmentStatus: EnrichmentStatus = venue.enrichmentStatus ?? 'provider_only';
  const familyScore = calculateFamilyScore(detail, profile, { enrichmentStatus, ...(policy ? { policy } : {}) });
  // Everything that counts AGAINST this family lives on the score, in one list: profile-derived
  // cautions first, then the reviewed facts that
  // count against them. The venue's own notes stay in `goodToKnow` and render as notes, not
  // warnings: "The cafe has highchairs" is not a caution, and it was being drawn as one.
  const cautions = [
    ...new Set(
      [
        buildDriveCaution(profile, venue.driveMinutes),
        (policy ?? activeFitPolicy()).evidenceAware
          ? buildConfirmedMissingCaution(profile, confirmedAbsentFacilities(venue, familyNeedsStepFree(profile)))
          : buildFacilityMissingCaution(profile, detail.facilities),
        buildStepFreeCaution(profile),
        ...(familyScore.cautions ?? []),
      ].filter((caution): caution is string => Boolean(caution)),
    ),
  ];
  const familyMatch = evaluateFamilyMatch({
    venue: { ...venue, facilities: detail.facilities },
    profile,
    score: familyScore.score,
    parentObservations,
  });
  return {
    ...venue,
    familyScore: { ...familyScore, cautions },
    familyMatch,
    fitConflicts: hardConflictsFor(venue.trustedFacts, profile),
    goodToKnow: detail.goodToKnow,
    facilities: detail.facilities,
  };
}

export function personaliseVenues(venues: Venue[], profile: FamilyProfile): Venue[] {
  return venues
    .map((venue) => personaliseVenue(venue, profile))
    // A stated limit (with ten minutes' leeway) narrows the list; no stated limit narrows nothing.
    .filter((venue) => driveLimitMinutes(profile) === null || venue.driveMinutes <= (driveLimitMinutes(profile) as number) + 10)
    .sort((a, b) => compareVenuesForFamily(a, b));
}

export function buildHomeRecommendations(profile: FamilyProfile): RecommendationSection[] {
  const personalised = personaliseVenues(mockVenues, profile);
  const childLabel = getChildNames(profile);
  const locationLabel = profile.homeLocation.trim() || 'your area';

  if (personalised.length === 0) {
    return [];
  }

  const top = personalised.slice(0, 3);
  const weekend = [personalised[2], personalised[0], personalised[4]].filter(Boolean);
  const rainy = personalised.filter((v) => v.category === 'museum' || v.category === 'farm');

  const sections: RecommendationSection[] = [
    {
      id: 'rec-1',
      title: 'Recommended for your family',
      subtitle: `Based on ${childLabel}'s ages and ${locationLabel}`,
      venues: top,
    },
  ];

  if (weekend.length >= 2) {
    sections.push({
      id: 'rec-2',
      title: 'Weekend ideas',
      subtitle: driveLimitMinutes(profile) === null ? 'Ideas for the weekend' : `Within ${driveLimitMinutes(profile)} minutes of home`,
      venues: weekend.slice(0, 3),
    });
  }

  if (rainy.length >= 1) {
    sections.push({
      id: 'rec-3',
      title: 'Rainy day ideas',
      subtitle: driveLimitMinutes(profile) === null ? 'Indoor options' : `Indoor options within ${driveLimitMinutes(profile)} minutes`,
      venues: rainy.slice(0, 2),
    });
  }

  return sections;
}
