import {
  ExternalPlaceRecord,
  FieldProvenance,
  PlaceSearchIntent,
  StructuredOpeningHours,
} from '../../src/types/places';
import { VenueCategory } from '../../src/types';

import {
  dedupeChains,
  dedupeVenueAliases,
  googleTypesForIntent,
  isSupportedForIntent,
  mapGoogleCategory,
  rankPlaces,
} from './places-quality';

/** Minimal field masks — Essentials + Pro for search; add contact/hours on detail only. */
export const GOOGLE_SEARCH_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.location',
  'places.formattedAddress',
  'places.primaryType',
  'places.types',
  'places.businessStatus',
].join(',');

export const GOOGLE_DETAIL_FIELD_MASK = [
  'id',
  'displayName',
  'location',
  'formattedAddress',
  'primaryType',
  'types',
  'websiteUri',
  'nationalPhoneNumber',
  'regularOpeningHours',
  'editorialSummary',
  'businessStatus',
].join(',');

/** Google Nearby rankPreference — popularity yields a quality candidate set; FamilyPilot re-ranks. */
export const GOOGLE_SEARCH_RANK_PREFERENCE = 'POPULARITY' as const;
export const EXPLORE_MAX_CANDIDATES = 20;
export const RESULT_LIMIT = 20;

function nowProvenance(): FieldProvenance {
  return {
    source: 'google',
    updatedAt: new Date().toISOString(),
    reliability: 'provider',
    label: 'Google Places',
  };
}

export function googleTypesForCategories(
  categories?: VenueCategory[],
  intent: PlaceSearchIntent = 'explore',
): string[] {
  if (intent === 'restaurant') return googleTypesForIntent('restaurant');
  if (categories?.length) {
    const fromCategories = categories.flatMap((category) => {
      switch (category) {
        case 'park':
          return ['park', 'playground', 'national_park'];
        case 'museum':
          return ['museum', 'art_gallery', 'childrens_museum'];
        case 'farm':
          return ['zoo'];
        case 'soft_play':
          return ['amusement_park', 'bowling_alley'];
        case 'beach':
          return ['beach'];
        default:
          return [];
      }
    });
    if (fromCategories.length > 0) return [...new Set(fromCategories)];
  }
  return googleTypesForIntent('explore');
}

export { mapGoogleCategory };

function mapOpeningHours(
  regularOpeningHours?: GoogleRegularOpeningHours,
): StructuredOpeningHours | undefined {
  const weekdayText = regularOpeningHours?.weekdayDescriptions;
  if (!weekdayText?.length) return undefined;
  return { weekdayText, source: 'google' };
}

function mapIsOpen(businessStatus?: string): boolean | undefined {
  if (!businessStatus) return undefined;
  if (businessStatus === 'OPERATIONAL') return true;
  if (businessStatus === 'CLOSED_TEMPORARILY' || businessStatus === 'CLOSED_PERMANENTLY') {
    return false;
  }
  return undefined;
}

export interface GooglePlacePayload {
  id?: string;
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  formattedAddress?: string;
  primaryType?: string;
  types?: string[];
  websiteUri?: string;
  nationalPhoneNumber?: string;
  regularOpeningHours?: GoogleRegularOpeningHours;
  editorialSummary?: { text?: string };
  businessStatus?: string;
}

interface GoogleRegularOpeningHours {
  weekdayDescriptions?: string[];
}

export function googlePlaceToRecord(
  place: GooglePlacePayload,
  intent: PlaceSearchIntent = 'explore',
  options?: { skipIntentFilter?: boolean },
): ExternalPlaceRecord | null {
  const placeId = place.id;
  const name = place.displayName?.text;
  const latitude = place.location?.latitude;
  const longitude = place.location?.longitude;
  if (!placeId || !name || latitude == null || longitude == null) return null;

  const primaryType = place.primaryType;
  const types = place.types ?? [];

  if (!options?.skipIntentFilter && !isSupportedForIntent(primaryType, types, intent, name)) {
    return null;
  }

  const category = mapGoogleCategory(primaryType, types, name);
  if (!category) return null;

  const prov = nowProvenance();
  const openingHours = mapOpeningHours(place.regularOpeningHours);
  const description = place.editorialSummary?.text;

  return {
    familypilotId: `fp-google-${placeId}`,
    externalId: `google:${placeId}`,
    provider: 'google',
    name,
    latitude,
    longitude,
    category,
    address: place.formattedAddress,
    description,
    openingHours,
    website: place.websiteUri,
    phone: place.nationalPhoneNumber,
    photos: [],
    isOpen: mapIsOpen(place.businessStatus),
    provenance: {
      name: prov,
      coordinates: prov,
      category: prov,
      address: place.formattedAddress ? prov : undefined,
      description: description ? prov : undefined,
      openingHours: openingHours ? prov : undefined,
      website: place.websiteUri ? prov : undefined,
      phone: place.nationalPhoneNumber ? prov : undefined,
      isOpen: place.businessStatus ? prov : undefined,
    },
    fetchedAt: new Date().toISOString(),
    enrichmentStatus: 'provider_only',
    googlePrimaryType: primaryType,
    googleTypes: types,
  };
}

export function processGoogleSearchResults(
  records: ExternalPlaceRecord[],
  originLat: number,
  originLng: number,
  intent: PlaceSearchIntent,
): ExternalPlaceRecord[] {
  const deduped = dedupeVenueAliases(dedupeChains(records, originLat, originLng, intent));
  return rankPlaces(deduped, {
    originLat,
    originLng,
    intent,
    maxResults: RESULT_LIMIT,
  });
}

export function parseGoogleExternalId(externalId: string): string | null {
  if (!externalId.startsWith('google:')) return null;
  return externalId.slice('google:'.length) || null;
}

export function parseGoogleFamilypilotId(familypilotId: string): string | null {
  if (!familypilotId.startsWith('fp-google-')) return null;
  return familypilotId.slice('fp-google-'.length) || null;
}
