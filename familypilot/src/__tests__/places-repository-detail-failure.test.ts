import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlacesApiError, placesApiClient } from '@/src/services/places/places-api-client';
import { getPlacesRepository, resetPlacesRepository } from '@/src/services/places/places-repository';
import { FamilyProfile } from '@/src/types';

const PROFILE: FamilyProfile = {
  id: 'p1',
  parentName: 'Parent',
  homeLocation: 'Bushey',
  homeLatitude: 51.64,
  homeLongitude: -0.36,
  maxDriveMinutes: 30,
  budgetTier: 'moderate',
  completionPercent: 100,
  members: [{ id: 'c1', name: 'Mia', role: 'child', dateOfBirth: '2020-01-01', age: 5 }],
};

/** An id no mock or legacy record answers to, so only the API can say what it is. */
const REAL_ID = 'fp-google-ChIJnotInAnyFixtureOrMock0001';

/**
 * Venue Detail has two failure screens: "Place not found" and "Could not load this place, try
 * again". The repository used to answer every API failure with the mock fallback, which for a real
 * id is null, so an outage, a timeout or a 500 all rendered as "this venue may have been removed".
 * That is a claim about the place made from a failure of ours.
 */
describe('venue detail: not found versus could not load', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetPlacesRepository();
  });

  it('a 404 from the API is "not found" (null)', async () => {
    vi.spyOn(placesApiClient, 'getDetail').mockRejectedValue(new PlacesApiError('Not found', 404));
    await expect(getPlacesRepository().getVenueDetail(REAL_ID, PROFILE)).resolves.toBeNull();
  });

  it('a 500 from the API is our failure, so it is thrown for the screen to say so', async () => {
    vi.spyOn(placesApiClient, 'getDetail').mockRejectedValue(new PlacesApiError('Upstream exploded', 500));
    await expect(getPlacesRepository().getVenueDetail(REAL_ID, PROFILE)).rejects.toThrow('Upstream exploded');
  });

  it('a network failure is our failure too', async () => {
    vi.spyOn(placesApiClient, 'getDetail').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(getPlacesRepository().getVenueDetail(REAL_ID, PROFILE)).rejects.toThrow('Failed to fetch');
  });

  it('a mock id is still served locally whatever the API says', async () => {
    vi.spyOn(placesApiClient, 'getDetail').mockRejectedValue(new TypeError('Failed to fetch'));
    const detail = await getPlacesRepository().getVenueDetail('venue-1', PROFILE);
    expect(detail?.id).toBe('venue-1');
  });

  it('carries the status on the error the client throws', async () => {
    const error = new PlacesApiError('x', 404);
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(404);
    expect(error.name).toBe('PlacesApiError');
  });
});
