import { mockVenueDetails, mockVenues } from '@/src/data/mock-data';
import { calculateFamilyScore } from '@/src/services/scoring/family-score';
import { EnrichmentStatus, FamilyProfile, RecommendationSection, Venue, VenueDetail, WeatherInfo } from '@/src/types';

import { getChildNames } from './profile-defaults';
import { buildRoutineCaution } from './routine-caution';

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
      description: `${venue.name} — family suitability has not yet been reviewed.`,
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

export function personaliseVenue(venue: Venue, profile: FamilyProfile, weather?: WeatherInfo | null): Venue {
  const detail = toVenueDetail(venue);
  const enrichmentStatus: EnrichmentStatus = venue.enrichmentStatus ?? 'provider_only';
  const familyScore = calculateFamilyScore(detail, profile, { enrichmentStatus, weather });
  const routineCaution = buildRoutineCaution(profile, venue.driveMinutes);
  return {
    ...venue,
    familyScore,
    goodToKnow: routineCaution ? [routineCaution, ...(detail.goodToKnow ?? [])] : detail.goodToKnow,
    facilities: detail.facilities,
  };
}

export function personaliseVenues(venues: Venue[], profile: FamilyProfile, weather?: WeatherInfo | null): Venue[] {
  return venues
    .map((venue) => personaliseVenue(venue, profile, weather))
    .filter((venue) => venue.driveMinutes <= profile.maxDriveMinutes + 10)
    .sort((a, b) => b.familyScore.score - a.familyScore.score);
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
      subtitle: `Based on ${childLabel}'s ages, today's weather, and ${locationLabel}`,
      venues: top,
    },
  ];

  if (weekend.length >= 2) {
    sections.push({
      id: 'rec-2',
      title: 'Weekend ideas',
      subtitle: `Within ${profile.maxDriveMinutes} minutes of home`,
      venues: weekend.slice(0, 3),
    });
  }

  if (rainy.length >= 1) {
    sections.push({
      id: 'rec-3',
      title: 'Rainy day ideas',
      subtitle: `Indoor options within ${profile.maxDriveMinutes} minutes`,
      venues: rainy.slice(0, 2),
    });
  }

  return sections;
}
