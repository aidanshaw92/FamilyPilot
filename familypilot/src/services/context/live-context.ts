import { mockWeather } from '@/src/data/mock-data';
import { resolveHomeCoordinates } from '@/src/services/places/geo-utils';
import { FamilyProfile, WeatherInfo } from '@/src/types';

import {
  contextApiClient,
  JourneyDestination,
  JourneyResult,
  LiveWeatherResult,
} from './context-api-client';

export type OpeningStatus = 'open' | 'closed' | 'unknown';

export function resolveOpeningStatus(isOpen?: boolean): OpeningStatus {
  if (isOpen === true) return 'open';
  if (isOpen === false) return 'closed';
  return 'unknown';
}

export function isEligibleOpeningStatus(status: OpeningStatus): boolean {
  return status !== 'closed';
}

export function openingStatusLabel(status: OpeningStatus): string {
  switch (status) {
    case 'open':
      return 'Open now';
    case 'closed':
      return 'Closed now';
    default:
      return 'Opening status not confirmed';
  }
}

function weatherFromMock(profile: FamilyProfile): WeatherInfo {
  return {
    ...mockWeather,
    description: profile.homeLocation.trim()
      ? `${mockWeather.description} near ${profile.homeLocation.trim()}`
      : mockWeather.description,
  };
}

export async function fetchLiveWeather(profile: FamilyProfile): Promise<WeatherInfo & { source?: string }> {
  const home = resolveHomeCoordinates(profile.homeLocation);
  try {
    const weather: LiveWeatherResult = await contextApiClient.getWeather(home.latitude, home.longitude);
    return {
      condition: weather.condition,
      temperature: weather.temperature,
      description: weather.description,
      source: weather.source,
    };
  } catch {
    return weatherFromMock(profile);
  }
}

export async function fetchLiveDriveTimes(
  profile: FamilyProfile,
  destinations: JourneyDestination[],
): Promise<Map<string, JourneyResult>> {
  if (destinations.length === 0) return new Map();

  const home = resolveHomeCoordinates(profile.homeLocation);
  try {
    const result = await contextApiClient.getDriveTimes(
      { latitude: home.latitude, longitude: home.longitude },
      destinations,
    );
    return new Map(result.journeys.map((journey) => [journey.placeId, journey]));
  } catch {
    return new Map();
  }
}
