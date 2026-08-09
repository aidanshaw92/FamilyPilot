import { FamilyProfile } from '@/src/types';
import { DayRequest, FocusedRecommendationsResult } from '@/src/types/day-request';
import { VenueFamilyMetadata } from '@/src/types/places';
import { buildFocusedRecommendation } from '@/src/services/matching/match-explanations';
import { rankVenueMatches } from '@/src/services/matching/day-request-matcher';
import { extractMatchableFacts } from '@/src/services/matching/venue-facts';
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

  const factsList = places.map((place) => {
    const metadata = metadataForPlace(place.familyMetadata, place.familypilotId);
    const venue = mergePlaceToVenue(place, metadata, home.latitude, home.longitude);
    return extractMatchableFacts(
      place.familypilotId,
      place.name,
      place.category,
      venue.driveMinutes,
      place.enrichmentStatus ?? metadata?.enrichmentStatus,
      metadata,
    );
  });

  const ranked = rankVenueMatches(factsList, request);
  const imageById = Object.fromEntries(
    places.map((p) => [p.familypilotId, p.photos[0] ?? '']),
  );

  const recommendations = ranked.map(({ facts, match }) =>
    buildFocusedRecommendation(facts, match, imageById[facts.placeId] ?? ''),
  );

  return {
    request,
    recommendations,
    eligibleCount: ranked.length,
    message:
      recommendations.length === 0
        ? 'No venues matched your requirements with confirmed family details. Try relaxing a requirement or explore nearby.'
        : undefined,
  };
}
