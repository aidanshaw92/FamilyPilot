import { ImageSourcePropType } from 'react-native';

/**
 * The official Google attribution asset for Places content, exactly as Google supplies it:
 * powered_by_google_on_white.png, 59 x 18, from
 * storage.googleapis.com/geo-devrel-public-buckets. Google's terms require the supplied file —
 * the mark may be scaled but never redrawn, recoloured or altered — so it is committed as
 * downloaded, and the sandbox this was built in could not reach Google's hosts, so a CI runner
 * fetched it (see the "Fetch the official Google attribution assets" step in
 * .github/workflows/home-photo-capture.yml).
 *
 * The white variant is the right one here: every surface it appears on is the app's near-white
 * background.
 */
export interface GoogleMapsMarkAsset {
  source: ImageSourcePropType;
  /** width / height of the supplied file, so it is only ever scaled, never stretched. */
  aspectRatio: number;
}

export const GOOGLE_MAPS_MARK: GoogleMapsMarkAsset | null = {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  source: require('../../assets/images/powered_by_google_on_white.png'),
  aspectRatio: 59 / 18,
};
