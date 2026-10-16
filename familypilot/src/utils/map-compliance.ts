import { PlacesProviderName } from '@/src/types/places';

/**
 * WHAT MAY BE DRAWN ON THE APP'S OWN MAP.
 *
 * FamilyPilot's maps (Meet halfway, and Explore's Map view) are drawn on the device from public-domain Natural Earth vectors. They are
 * not Google maps. Google's Places terms do not allow Places content to be used with a map that is not a Google map (the Places
 * API service terms, "No use with a non-Google map"; a summary of section 5.3, to be confirmed against the primary text). Every place
 * Explore and Meet halfway serve today is a Google Places row, and its position is the position Google returned.
 *
 * So the rule here is the strict one, and it is decided by where the PLACE came from, not by whose coordinates happen to be nearby:
 *
 *   - A place whose provider is not Google, and is known, can be plotted: its position and its content are not Google Places content.
 *   - A Google place is never plotted. Matching an OpenStreetMap position to a Google place does NOT make the Google place's name,
 *     hours, photos or description reusable on a map, and a place that is shown on a map with Google content beside it is Google
 *     content used with a non-Google map. Where an independent record exists for the same venue, it is a separate place with its own
 *     provider (see docs/MAP_COMPLIANCE.md), and only that record is drawn.
 *   - A place of unknown origin is not plotted. Nothing is guessed (the same rule `attribution.ts` follows).
 *
 * And the map and Places content are not shown together. A screen offers its map only when EVERY place it would show is one of the
 * above: otherwise it is a list. A list of Google places is fine on its own (with Google's attribution); the map is what is switched off.
 *
 * Plain module, not a component, so the rule can be tested without a React Native import in the way.
 */

/**
 * Providers whose places may be drawn on the app's own map. `mock` is the demo and test catalogue, which is synthetic.
 * `familypilot` is deliberately NOT listed: a row of our own has no recorded origin for its position, so it must state one first.
 * A provider joins this list in the same change that adds an independent source, with its licence and credit.
 */
export const MAPPABLE_PROVIDERS: readonly PlacesProviderName[] = ['osm', 'wikidata', 'os-greenspace', 'mock'];

/** True when the place may be drawn on the app's own map. Unknown origin is false. */
export function canPlotOnOwnMap(place: { provider?: PlacesProviderName }): boolean {
  return place.provider !== undefined && MAPPABLE_PROVIDERS.includes(place.provider);
}

/**
 * Whether a screen may offer its map for these places. True for no places at all (the map then shows only what the family
 * entered: their own area and the other family's), and true only when every place can be plotted.
 */
export function mapAllowedFor(places: ReadonlyArray<{ provider?: PlacesProviderName }>): boolean {
  return places.every(canPlotOnOwnMap);
}

/** Why a screen shows a list and no map, in words a parent can use. */
export const MAP_OFF_MESSAGE = 'The map is switched off for now. Every place is in this list, in order.';
