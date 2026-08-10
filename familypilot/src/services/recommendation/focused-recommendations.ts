import { FamilyProfile } from '@/src/types';
import { DayRequest, FocusedRecommendationsResult } from '@/src/types/day-request';
import { VenueFamilyMetadata } from '@/src/types/places';
import { buildFocusedRecommendation } from '@/src/services/matching/match-explanations';
import { rankVenueMatches } from '@/src/services/matching/day-request-matcher';
import { extractMatchableFacts } from '@/src/services/matching/venue-facts';
import { fetchLiveDriveTimes, isEligibleOpeningStatus } from '@/src/services/context/live-context';
import { mergePlaceToVenue } from '@/src/services/places/merge-place';
import { placesApiClient } from '@/src/services/places/places-api-client';
import { resolveHomeCoordinates } from '@/src/services/places/geo-utils';
import { getFamilyPlaceMetadata } from '@/src/data/family-place-metadata';

function metadataForPlace(
  familyMetadata: VenueFamilyMetadata | undefined,
  placeId: string,
): VenueFamilyMetadata | null {
  return familyMetadata ?? getFamilyPlaceMetadata(placeId);
}

export async function getFocusedRecommendations(
  profile: FamilyProfile,
  request: DayRequest,
): Promise<FocusedRecommendationsResult> {
  const home = resolveHomeCoordinates(profile.homeLocation);
  const params = {
    latitude: home.latitude,
    longitude: home.longitude,
    radiusKm: (profile.maxDriveMinutes / 60) * 40 * 1.2,
    intent: 'explore' as const,
  };

  let places = [];
  try {
    const result = await placesApiClient.search(params);
    places = result.places;
  } catch {
    return {
      request,
      recommendations: [],
      eligibleCount: 0,
      message: 'Could not load nearby venues. Try again or explore manually.',
    };
  }

  const journeyLookup = await fetchLiveDriveTimes(
    profile,
    places.map((place) => ({
      placeId: place.familypilotId,
      latitude: place.latitude,
      longitude: place.longitude,
    })),
  );

  const factsList = places.map((place) => {
    const metadata = metadataForPlace(place.familyMetadata, place.familypilotId);
    const venue = mergePlaceToVenue(place, metadata, home.latitude, home.longitude);
    const liveJourney = journeyLookup.get(place.familypilotId);
    const driveMinutes = liveJourney?.driveMinutes ?? venue.driveMinutes;
    return {
      facts: extractMatchableFacts(
        place.familypilotId,
        place.name,
        place.category,
        driveMinutes,
        place.enrichmentStatus ?? metadata?.enrichmentStatus,
        metadata,
        place.isOpen,
      ),
      journeySource: liveJourney?.source,
    };
  });

  const ranked = rankVenueMatches(
    factsList
      .filter(({ facts }) => isEligibleOpeningStatus(facts.openingStatus))
      .map(({ facts }) => facts),
    request,
    profile,
  );

  const journeySourceById = Object.fromEntries(
    factsList.map(({ facts, journeySource }) => [facts.placeId, journeySource]),
  );
  const imageById = Object.fromEntries(
    places.map((p) => [p.familypilotId, p.photos[0] ?? '']),
  );

  const recommendations = ranked.map(({ facts, match }) =>
    buildFocusedRecommendation(
      facts,
      match,
      imageById[facts.placeId] ?? '',
      journeySourceById[facts.placeId],
    ),
  );

  return {
    request,
    recommendations,
    eligibleCount: ranked.length,
    message:
      recommendations.length === 0
        ? 'No open venues matched your requirements with confirmed family details. Try relaxing a requirement or explore nearby.'
        : undefined,
  };
}
