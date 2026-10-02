import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { spacing } from '@/src/design-system/tokens';
import {
  ATTRIBUTION_INK,
  OSM_COPYRIGHT_URL,
  OSM_CREDIT,
  creditsForPlaces,
} from '@/src/services/places/attribution';
import { PlacesProviderName } from '@/src/types/places';

import { GoogleMapsMark } from './GoogleAttribution';

/**
 * The credits a list of places owes, one line, each holder named once.
 *
 * A list is where a blanket credit does the most damage, and where this app had the defect: Home
 * showed the Google Maps mark under any non-empty shortlist, so the two OpenStreetMap museums served
 * from production (Kingston Museum, Chiswick House) were credited to Google. Explore showed place
 * content from both providers and credited neither.
 *
 * So the credits are derived from the list in hand rather than assumed. A mixed list names both
 * holders; an all-OpenStreetMap list names only OpenStreetMap; a list whose rows carry no recorded
 * provider names nobody, because a missing provenance record is not grounds to credit a provider.
 */
export function PlaceCredits({
  places,
  compact = true,
}: {
  places: ReadonlyArray<{ provider?: PlacesProviderName }>;
  compact?: boolean;
}) {
  const credits = creditsForPlaces(places);

  if (credits.length === 0) return null;

  return (
    <View style={styles.row} testID="place-credits">
      {credits.map((credit) =>
        credit === 'google' ? (
          <View
            key="google"
            accessible
            accessibilityLabel="Place information from Google Maps"
            testID="place-credits-google"
          >
            <GoogleMapsMark compact={compact} />
          </View>
        ) : (
          <Pressable
            key="osm"
            onPress={() => void Linking.openURL(OSM_COPYRIGHT_URL)}
            accessibilityRole="link"
            accessibilityLabel="Map data from OpenStreetMap contributors, opens the licence"
            testID="place-credits-osm"
            hitSlop={8}
          >
            <Text variant="caption" color={ATTRIBUTION_INK}>
              {OSM_CREDIT}
            </Text>
          </Pressable>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
