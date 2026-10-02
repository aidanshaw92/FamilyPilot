import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { spacing } from '@/src/design-system/tokens';
import { PlacesProviderName } from '@/src/types/places';

import { GoogleMapsMark } from './GoogleAttribution';

/**
 * The credit a place carries, chosen by where the place actually came from.
 *
 * Attribution is a licence condition rather than a courtesy, and the two providers this app uses
 * ask for different things. Google requires its mark on Google content. OpenStreetMap is published
 * under the ODbL, which requires crediting "OpenStreetMap contributors" wherever its data is shown.
 *
 * Until this existed the client had no way to tell them apart -- `provider` was not carried onto the
 * consumer `Venue` at all -- so Google's mark appeared over every place regardless of source, which
 * both under-credits OpenStreetMap and misattributes its data to Google. Three OSM-sourced venues
 * were being served to parents that way.
 */

/** Where the ODbL's "and a link to the licence" is satisfied for a reader who wants it. */
const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';

export const ATTRIBUTION_INK = '#5E5E5E';

export function PlaceAttribution({ provider }: { provider?: PlacesProviderName }) {
  if (provider === 'osm') {
    return (
      <Pressable
        onPress={() => void Linking.openURL(OSM_COPYRIGHT_URL)}
        accessibilityRole="link"
        accessibilityLabel="Map data from OpenStreetMap contributors, opens the licence"
        style={styles.row}
        testID="place-attribution-osm"
      >
        <Text variant="caption" color={ATTRIBUTION_INK}>
          © OpenStreetMap contributors
        </Text>
      </Pressable>
    );
  }

  // `mock` and `familypilot` places are our own and carry no provider credit; anything from Google
  // carries Google's mark. An absent provider is treated as Google because that is where all but
  // nineteen of the stored rows come from, and crediting the wrong one is the failure to avoid.
  if (provider === 'mock' || provider === 'familypilot') return null;

  return (
    <View style={styles.row} testID="place-attribution-google">
      <GoogleMapsMark compact />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs },
});
