import { PlacesProviderName } from '@/src/types/places';

/**
 * Which credit a place is owed, decided only by where the place actually came from.
 *
 * Deliberately a plain module rather than part of the component that renders it. Attribution is a
 * licence condition, so the rule deserves to be stated and tested on its own, without a React Native
 * import standing between it and a test.
 *
 * NOTHING IS GUESSED. An earlier version defaulted an absent provider to Google, reasoning that
 * Google is where all but nineteen stored rows come from. That is wrong in its own terms: when
 * provenance is unknown, defaulting to the majority IS crediting the wrong holder, which is the
 * exact failure attribution exists to prevent. A statistical majority is not a provenance record.
 */

/**
 * What a surface can say about a place's origin.
 *
 * `unknown` is a real, nameable state rather than an absence to be filled in: a venue persisted
 * before `provider` was carried through has no provenance record, and inventing one is not an option.
 */
export type PlaceAttributionSource = PlacesProviderName | 'unknown';

/**
 * The ODbL's requested credit, and the link that makes the licence clear.
 *
 * Both come from the OpenStreetMap Foundation's attribution guidance: the requested form is
 * "© OpenStreetMap contributors", and pointing it at the copyright page is how a reader reaches the
 * licence and the data sources behind it.
 */
export const OSM_CREDIT = '© OpenStreetMap contributors';
export const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';

/** The grey both providers' guidance permits for attribution on a light background. */
export const ATTRIBUTION_INK = '#5E5E5E';

/** Resolves a possibly-absent provider into the explicit vocabulary above. */
export function attributionSourceOf(
  provider: PlacesProviderName | undefined,
): PlaceAttributionSource {
  return provider ?? 'unknown';
}

/**
 * Whether an external credit is owed, and which.
 *
 * `null` covers two different situations that happen to render the same way, and the distinction is
 * worth keeping: our own rows owe nobody a credit, and an unknown origin owes a credit we cannot
 * name. Neither is licence to show somebody else's mark.
 */
export function externalCreditFor(
  provider: PlacesProviderName | undefined,
): 'google' | 'osm' | null {
  const source = attributionSourceOf(provider);
  if (source === 'google') return 'google';
  if (source === 'osm') return 'osm';
  return null;
}

/** The distinct credits a mixed list of places owes, so a screen can show each one once. */
export function creditsForPlaces(
  places: ReadonlyArray<{ provider?: PlacesProviderName }>,
): Array<'google' | 'osm'> {
  const seen = new Set<'google' | 'osm'>();
  for (const place of places) {
    const credit = externalCreditFor(place.provider);
    if (credit) seen.add(credit);
  }
  // Stable order, so a list's footer does not reshuffle as results change.
  return (['google', 'osm'] as const).filter((credit) => seen.has(credit));
}
