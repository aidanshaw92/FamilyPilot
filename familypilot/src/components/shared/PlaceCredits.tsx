import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { minTarget } from '@/src/components/ui/touch';
import { Text } from '@/src/components/ui/Text';
import { spacing } from '@/src/design-system/tokens';
import {
  ATTRIBUTION_INK,
  FSA_CREDIT,
  OGL_URL,
  OSM_COPYRIGHT_URL,
  OSM_CREDIT,
  OS_CREDIT,
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
        ) : credit === 'os' ? (
          <Pressable
            key="os"
            onPress={() => void Linking.openURL(OGL_URL)}
            accessibilityRole="link"
            accessibilityLabel="Ordnance Survey data, opens the Open Government Licence"
            testID="place-credits-os"
            hitSlop={8}
            style={[minTarget(16), styles.osmLink]}
          >
            <Text variant="caption" color={ATTRIBUTION_INK} style={styles.osmText}>
              {OS_CREDIT}
            </Text>
          </Pressable>
        ) : credit === 'fsa' ? (
          <Pressable
            key="fsa"
            onPress={() => void Linking.openURL(OGL_URL)}
            accessibilityRole="link"
            accessibilityLabel="Food Standards Agency data, opens the Open Government Licence"
            testID="place-credits-fsa"
            hitSlop={8}
            style={[minTarget(16), styles.osmLink]}
          >
            <Text variant="caption" color={ATTRIBUTION_INK} style={styles.osmText}>
              {FSA_CREDIT}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            key="osm"
            onPress={() => void Linking.openURL(OSM_COPYRIGHT_URL)}
            accessibilityRole="link"
            accessibilityLabel="Map data from OpenStreetMap contributors, opens the licence"
            testID="place-credits-osm"
            hitSlop={8}
            style={[minTarget(16), styles.osmLink]}
          >
            <Text variant="caption" color={ATTRIBUTION_INK} style={styles.osmText}>
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
  // At the largest text sizes the credit is wider than a phone; it wraps inside the screen rather than running off it.
  osmLink: { maxWidth: '100%' },
  osmText: { textAlign: 'center', flexShrink: 1 },
});
