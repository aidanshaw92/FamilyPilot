import { PlacesDataError } from '../../src/types/places';

export type GooglePlacesErrorCode = PlacesDataError['code'];

export class GooglePlacesError extends Error {
  readonly code: GooglePlacesErrorCode;

  constructor(message: string, code: GooglePlacesErrorCode) {
    super(message);
    this.name = 'GooglePlacesError';
    this.code = code;
  }
}

export function mapHttpStatusToError(status: number, message: string): GooglePlacesError {
  if (status === 429) {
    return new GooglePlacesError(message || 'Google Places rate limit exceeded', 'RATE_LIMITED');
  }
  if (status === 404) {
    return new GooglePlacesError(message || 'Place not found', 'NOT_FOUND');
  }
  if (status >= 500) {
    return new GooglePlacesError(message || 'Google Places service unavailable', 'PROVIDER_UNAVAILABLE');
  }
  return new GooglePlacesError(message || `Google Places API error: ${status}`, 'PROVIDER_UNAVAILABLE');
}
