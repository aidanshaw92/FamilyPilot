import { mockVenueDetails, mockVenues } from '@/src/data/mock-data';
import { calculateFamilyScore } from '@/src/services/scoring/family-score';
import { FamilyProfile, RecommendationSection, Venue, VenueDetail } from '@/src/types';

import { getChildNames } from './profile-defaults';

function toVenueDetail(venue: Venue): VenueDetail {
  return mockVenueDetails[venue.id] ?? {
    ...venue,
    photos: [venue.imageUrl],
    facilities: ['toilets', 'parking'],
    openingHours: 'Estimated · Usually 8:00 AM – 6:00 PM',
    terrain: 'mixed',
    bestAges: 'All ages',
    parkingInfo: 'Parking nearby',
    description: `${venue.name} — prototype venue data.`,
  };
}

export function personaliseVenue(venue: Venue, profile: FamilyProfile): Venue {
  const detail = toVenueDetail(venue);
  const familyScore = calculateFamilyScore(detail, profile);
  return { ...venue, familyScore };
}

export function personaliseVenues(venues: Venue[], profile: FamilyProfile): Venue[] {
  return venues
    .map((venue) => personaliseVenue(venue, profile))
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
