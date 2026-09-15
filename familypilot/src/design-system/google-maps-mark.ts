import { ImageSourcePropType } from 'react-native';

/**
 * The official Google Maps attribution asset, once we have it.
 *
 * Current Places guidance is that attribution should be the Google Maps logo, not the older
 * Google-only logotype — and that where space is limited, the text "Google Maps" is acceptable.
 * We could not obtain the Google Maps asset: the only files reachable from Google's public
 * buckets and linked from its policy pages are the Google-only logotype
 * (powered_by_google_on_white.png, maps.gstatic.com/.../google4.png) and unrelated site chrome.
 * Shipping the Google-only mark would be the form the guidance moved away from, and redrawing or
 * approximating the Maps lockup is expressly forbidden — so this stays null and the attribution
 * renders as the permitted wordmark text.
 *
 * To switch to the asset: drop Google's supplied file into assets/images, point `source` at it,
 * and set `aspectRatio` to the file's own width / height. Nothing else changes, and the mark is
 * only ever scaled, never altered.
 */
export interface GoogleMapsMarkAsset {
  source: ImageSourcePropType;
  /** width / height of the supplied file, so it is only ever scaled, never stretched. */
  aspectRatio: number;
}

export const GOOGLE_MAPS_MARK: GoogleMapsMarkAsset | null = null;
