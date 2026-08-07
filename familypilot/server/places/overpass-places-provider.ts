import {
  ExternalPlaceRecord,
  FieldProvenance,
  PlaceSearchParams,
  StructuredOpeningHours,
} from '../../src/types/places';
import { VenueCategory } from '../../src/types';
import { PlacesProvider } from '../../src/services/providers/places-provider';
import { distanceKm, slugifyId } from '../../src/services/places/geo-utils';

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const OVERPASS_USER_AGENT = 'FamilyPilot/1.0 (https://family-pilot-seven.vercel.app; places-api)';

const CATEGORY_QUERIES: Record<VenueCategory, string[]> = {
  park: ['["leisure"="park"]', '["leisure"="playground"]', '["leisure"="nature_reserve"]'],
  museum: ['["tourism"="museum"]', '["tourism"="gallery"]'],
  farm: ['["tourism"="farm"]', '["tourism"="zoo"]'],
  restaurant: ['["amenity"="restaurant"]', '["amenity"="cafe"]'],
  cafe: ['["amenity"="cafe"]'],
  beach: ['["natural"="beach"]'],
  soft_play: ['["leisure"="indoor_play"]'],
  hotel: ['["tourism"="hotel"]'],
  shop: ['["shop"="supermarket"]', '["shop"="convenience"]'],
};

function nowProvenance(source: 'osm'): FieldProvenance {
  return {
    source,
    updatedAt: new Date().toISOString(),
    reliability: 'provider',
    label: 'OpenStreetMap via Overpass',
  };
}

function mapOsmCategory(tags: Record<string, string>): VenueCategory {
  if (tags.amenity === 'cafe') return 'cafe';
  if (tags.amenity === 'restaurant') return 'restaurant';
  if (tags.tourism === 'museum' || tags.tourism === 'gallery') return 'museum';
  if (tags.tourism === 'farm' || tags.tourism === 'zoo') return 'farm';
  if (tags.leisure === 'park' || tags.leisure === 'playground') return 'park';
  if (tags.natural === 'beach') return 'beach';
  return 'park';
}

function elementToRecord(element: OverpassElement): ExternalPlaceRecord | null {
  const tags = element.tags ?? {};
  const name = tags.name;
  if (!name) return null;

  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  if (lat === undefined || lon === undefined) return null;

  const externalId = `osm:${element.type}/${element.id}`;
  const category = mapOsmCategory(tags);
  const prov = nowProvenance('osm');

  const openingHours: StructuredOpeningHours | undefined = tags.opening_hours
    ? { weekdayText: [tags.opening_hours], source: 'osm' }
    : undefined;

  return {
    familypilotId: `fp-osm-${slugifyId(String(element.id))}`,
    externalId,
    provider: 'osm',
    name,
    latitude: lat,
    longitude: lon,
    category,
    address: [tags['addr:street'], tags['addr:city'], tags['addr:postcode']].filter(Boolean).join(', ') || undefined,
    description: tags.description,
    openingHours,
    website: tags.website,
    phone: tags.phone ?? tags['contact:phone'],
    photos: tags.wikimedia_commons ? [`https://commons.wikimedia.org/wiki/${tags.wikimedia_commons}`] : [],
    provenance: {
      name: prov,
      coordinates: prov,
      category: prov,
      address: tags['addr:street'] ? prov : undefined,
      openingHours: tags.opening_hours ? prov : undefined,
      website: tags.website ? prov : undefined,
      phone: tags.phone || tags['contact:phone'] ? prov : undefined,
    },
    fetchedAt: new Date().toISOString(),
  };
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function buildOverpassQuery(lat: number, lng: number, radiusM: number, categories?: VenueCategory[]): string {
  const cats = categories?.length ? categories : (['park', 'museum', 'farm', 'restaurant'] as VenueCategory[]);
  const filters = new Set<string>();
  for (const cat of cats) {
    for (const filter of CATEGORY_QUERIES[cat] ?? []) {
      filters.add(`  node${filter}(around:${radiusM},${lat},${lng});`);
      filters.add(`  way${filter}(around:${radiusM},${lat},${lng});`);
    }
  }

  return `[out:json][timeout:25];
(
${[...filters].join('\n')}
);
out center 30;`;
}

export class OverpassPlacesProvider implements PlacesProvider {
  readonly name = 'osm' as const;

  async searchNearby(params: PlaceSearchParams): Promise<ExternalPlaceRecord[]> {
    const radiusM = Math.round(params.radiusKm * 1000);
    const query = buildOverpassQuery(params.latitude, params.longitude, radiusM, params.categories);

    const response = await fetch(OVERPASS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': OVERPASS_USER_AGENT,
        Accept: 'application/json',
      },
      body: new URLSearchParams({ data: query }).toString(),
    });

    if (!response.ok) {
      throw new Error(`Overpass API error: ${response.status}`);
    }

    const data = (await response.json()) as { elements: OverpassElement[] };
    const seen = new Set<string>();

    return data.elements
      .map(elementToRecord)
      .filter((record): record is ExternalPlaceRecord => record !== null)
      .filter((record) => {
        if (seen.has(record.externalId)) return false;
        seen.add(record.externalId);
        const km = distanceKm(params.latitude, params.longitude, record.latitude, record.longitude);
        return km <= params.radiusKm;
      });
  }

  async getPlace(): Promise<ExternalPlaceRecord | null> {
    return null;
  }

  async getPlaceByExternalId(): Promise<ExternalPlaceRecord | null> {
    return null;
  }
}

export const overpassPlacesProvider = new OverpassPlacesProvider();
