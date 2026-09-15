import { ImageSourcePropType } from 'react-native';

/**
 * The official Google Maps attribution asset.
 *
 * Google's branding terms require the supplied file: the mark must not be redrawn, recoloured or
 * altered, only scaled. The agent sandbox this was built in cannot reach Google's asset hosts, so
 * the file is fetched on a CI runner and committed here — see the "Fetch the official Google
 * attribution assets" step in .github/workflows/home-photo-capture.yml.
 *
 * Until it lands, this stays null and the attribution falls back to the wordmark set in text,
 * which Google's policy allows where space is limited. Point `source` at the committed file and
 * set its true aspect ratio to switch over; nothing else needs to change.
 */
export interface GoogleMapsMarkAsset {
  source: ImageSourcePropType;
  /** width / height of the supplied file, so it is only ever scaled, never stretched. */
  aspectRatio: number;
}

export const GOOGLE_MAPS_MARK: GoogleMapsMarkAsset | null = null;
