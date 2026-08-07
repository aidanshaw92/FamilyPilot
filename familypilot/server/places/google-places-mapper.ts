import {
  ExternalPlaceRecord,
  FieldProvenance,
  StructuredOpeningHours,
} from '../../src/types/places';
import { VenueCategory } from '../../src/types';

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

const CATEGORY_TO_GOOGLE_TYPES: Partial<Record<VenueCategory, string[]>> = {
  park: ['park', 'playground'],
  museum: ['museum'],
  farm: ['zoo'],
  restaurant: ['restaurant'],
  cafe: ['cafe', 'coffee_shop'],
  beach: ['beach'],
  hotel: ['lodging'],
  shop: ['supermarket'],
};

const DEFAULT_SEARCH_TYPES = ['park', 'museum', 'restaurant', 'cafe', 'zoo'];

function nowProvenance(): FieldProvenance {
  return {
    source: 'google',
    updatedAt: new Date().toISOString(),
    reliability: 'provider',
    label: 'Google Places',
  };
}

export function googleTypesForCategories(categories?: VenueCategory[]): string[] {
  if (!categories?.length) return DEFAULT_SEARCH_TYPES;
  const types = new Set<string>();
  for (const category of categories) {
    for (const type of CATEGORY_TO_GOOGLE_TYPES[category] ?? []) {
      types.add(type);
    }
  }
  return types.size > 0 ? [...types] : DEFAULT_SEARCH_TYPES;
}

export function mapGoogleCategory(primaryType?: string, types: string[] = []): VenueCategory {
  const candidates = [primaryType, ...types].filter(Boolean) as string[];
  for (const type of candidates) {
    if (type === 'restaurant' || type.endsWith('_restaurant')) return 'restaurant';
    if (type === 'cafe' || type === 'coffee_shop') return 'cafe';
    if (type === 'museum' || type === 'art_gallery') return 'museum';
    if (type === 'zoo') return 'farm';
    if (type === 'park' || type === 'playground' || type === 'national_park') return 'park';
    if (type === 'beach') return 'beach';
    if (type === 'lodging' || type === 'hotel') return 'hotel';
    if (type === 'supermarket' || type === 'grocery_store') return 'shop';
  }
  return 'park';
}

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

export function googlePlaceToRecord(place: GooglePlacePayload): ExternalPlaceRecord | null {
  const placeId = place.id;
  const name = place.displayName?.text;
  const latitude = place.location?.latitude;
  const longitude = place.location?.longitude;
  if (!placeId || !name || latitude == null || longitude == null) return null;

  const category = mapGoogleCategory(place.primaryType, place.types ?? []);
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
  };
}

export function parseGoogleExternalId(externalId: string): string | null {
  if (!externalId.startsWith('google:')) return null;
  return externalId.slice('google:'.length) || null;
}

export function parseGoogleFamilypilotId(familypilotId: string): string | null {
  if (!familypilotId.startsWith('fp-google-')) return null;
  return familypilotId.slice('fp-google-'.length) || null;
}
