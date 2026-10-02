/**
 * Somewhere to eat near a venue, as OpenStreetMap describes it.
 *
 * The shape is deliberately narrower than `Venue`. A candidate is NOT a venue: it carries no rating,
 * no photograph, no family score and no confirmed facilities, because OpenStreetMap supplies none of
 * those and inventing them is how a "nearby restaurant" silently becomes a "family facilities
 * confirmed" claim. A surface that wants to show more has to get it from somewhere real first.
 */

/** How a travel duration was obtained. Nothing here is ever measured today. */
export type FoodTravelSource = 'estimated' | 'measured';

/**
 * The modes a candidate can carry.
 *
 * `transit` and `bus` exist in the type and are never populated by the OSM path, because a straight
 * line cannot tell you whether a bus runs. They are here so that a real public-transport provider can
 * be added later without the surfaces changing shape, and so that a bus is never labelled as generic
 * public transport or the reverse.
 */
export type FoodTravelMode = 'walk' | 'drive' | 'transit' | 'bus';

export interface FoodTravelOption {
  mode: FoodTravelMode;
  minutes: number;
  source: FoodTravelSource;
}

/**
 * Tags OpenStreetMap carried, each present only when it explicitly said yes.
 *
 * Every field is `true | undefined`, never `false`. That is the point: an unmapped highchair is not a
 * venue without highchairs, and collapsing the two would turn a silent map into a negative claim.
 */
export interface FoodCandidateTags {
  highchair?: true;
  changingTable?: true;
  outdoorSeating?: true;
  wheelchair?: true;
}

export interface FoodCandidate {
  familypilotId: string;
  externalId: string;
  /** Always 'osm' on this path. Present so a surface can credit the right holder. */
  provider: 'osm';
  name: string;
  category: 'restaurant' | 'cafe' | 'fast_food';
  latitude: number;
  longitude: number;
  /** Straight-line kilometres from the anchor. */
  distanceKm: number;
  cuisine: string | null;
  /** The raw OSM expression, unparsed. Null means nobody mapped it, not that it never opens. */
  openingHours: string | null;
  address: string | null;
  website: string | null;
  phone: string | null;
  tagged: FoodCandidateTags;
  travel: FoodTravelOption[];
}

export interface NearbyFoodResult {
  anchor: { latitude: number; longitude: number; placeId: string | null };
  candidates: FoodCandidate[];
  totalFound: number;
  provider: 'osm';
  /** Always 0. Present so a caller can verify no Google request happened rather than assume it. */
  googleCalls: number;
  overpassRequests: number;
  cacheState: 'hit' | 'stale' | 'miss' | 'bypass';
  radiusM: number;
  fetchedAt: string;
  attribution: 'osm';
}
