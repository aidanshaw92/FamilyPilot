import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { minTarget } from '@/src/components/ui/touch';
import { Text } from '@/src/components/ui/Text';
import { spacing } from '@/src/design-system/tokens';
import {
  ATTRIBUTION_INK,
  OSM_COPYRIGHT_URL,
  OSM_CREDIT,
  externalCreditFor,
} from '@/src/services/places/attribution';
import { PlacesProviderName } from '@/src/types/places';

import { GoogleMapsMark } from './GoogleAttribution';

/**
 * Renders the credit a place is owed. The rule itself lives in services/places/attribution, so the
 * licence condition can be stated and tested without a React Native import in the way.
 */
export function PlaceAttribution({ provider }: { provider: PlacesProviderName | undefined }) {
  const credit = externalCreditFor(provider);

  if (credit === 'osm') {
    return (
      <Pressable
        onPress={() => void Linking.openURL(OSM_COPYRIGHT_URL)}
        accessibilityRole="link"
        accessibilityLabel="Map data from OpenStreetMap contributors, opens the licence"
        style={[styles.row, minTarget(20)]}
        testID="place-attribution-osm"
      >
        <Text variant="caption" color={ATTRIBUTION_INK}>
          {OSM_CREDIT}
        </Text>
      </Pressable>
    );
  }

  if (credit === 'google') {
    return (
      <View style={styles.row} testID="place-attribution-google">
        <GoogleMapsMark compact />
      </View>
    );
  }

  // Our own rows owe nobody a credit; an unknown origin owes one we cannot name. Both render
  // nothing, and neither is licence to show somebody else's mark.
  return null;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs },
});
