import { WeatherInfo } from '@/src/types';

export interface JourneyDestination {
  placeId: string;
  latitude: number;
  longitude: number;
}

export interface JourneyResult {
  placeId: string;
  driveMinutes: number;
  source: 'live' | 'estimated';
}

export interface JourneyBatchResult {
  journeys: JourneyResult[];
  provider: 'google' | 'fallback';
  source: 'live' | 'estimated';
  fetchedAt: string;
}

export interface LiveWeatherResult extends WeatherInfo {
  source: 'live' | 'estimated';
  provider: string;
  fetchedAt: string;
  coordinates: { latitude: number; longitude: number };
}

function getContextApiBaseUrl(): string {
  if (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_CONTEXT_API_URL) {
    return process.env.EXPO_PUBLIC_CONTEXT_API_URL.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api/context`;
  }
  return '/api/context';
}

export class ContextApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? getContextApiBaseUrl();
  }

  async getWeather(latitude: number, longitude: number): Promise<LiveWeatherResult> {
    const query = new URLSearchParams({
      lat: String(latitude),
      lng: String(longitude),
    });
    const response = await fetch(`${this.baseUrl}/weather?${query.toString()}`);
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `Weather API error ${response.status}`);
    }
    return response.json() as Promise<LiveWeatherResult>;
  }

  async getDriveTimes(
    origin: { latitude: number; longitude: number },
    destinations: JourneyDestination[],
  ): Promise<JourneyBatchResult> {
    const response = await fetch(`${this.baseUrl}/journey`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin, destinations }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `Journey API error ${response.status}`);
    }
    return response.json() as Promise<JourneyBatchResult>;
  }
}

export const contextApiClient = new ContextApiClient();
