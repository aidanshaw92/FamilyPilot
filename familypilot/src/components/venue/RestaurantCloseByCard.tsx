import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { VenueImage } from '@/src/components/ui/VenueImage';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { FoodCandidate } from '@/src/types/nearby-food';
import {
  CATEGORY_NOUN,
  restaurantFacilityChips,
  restaurantOpenLine,
  restaurantTravelLine,
} from '@/src/utils/restaurant-card-lines';

/**
 * A place to eat near a venue, as a compact product card: what a parent choosing a lunch stop needs, in the order they
 * need it (how far to walk, whether it is open, what is recorded for families), and nothing the data does not carry.
 *
 * It replaces a 262 x 200 placeholder tile that was mostly empty illustration. OpenStreetMap supplies no photograph, so
 * the thumbnail is FamilyPilot's category illustration, small, and the card's weight is the information beside it. No
 * rating, no family score and no "good for kids": OSM holds none, and a card that implied it would be a false claim.
 */
export const RESTAURANT_CARD_WIDTH = 300;

export function RestaurantCloseByCard({ candidate, now }: { candidate: FoodCandidate; now?: Date }) {
  const travel = restaurantTravelLine(candidate.travel);
  const noun = candidate.cuisine ? candidate.cuisine.replace(/[_;]/g, ' ') : CATEGORY_NOUN[candidate.category];
  const meta = [travel, noun].filter(Boolean).join(' · ');
  const open = restaurantOpenLine(candidate, now);
  const chips = restaurantFacilityChips(candidate);
  const openInMaps = () => {
    const query = encodeURIComponent(`${candidate.name} ${candidate.address ?? ''}`.trim());
    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
  };
  const positive = open.state === 'open_now' || open.state === 'open_all_day' || open.state === 'opens_later';
  const negative = open.state === 'closed_today' || open.state === 'closed_for_today' || open.state === 'never_open';

  return (
    <Pressable
      onPress={openInMaps}
      accessibilityRole="button"
      accessibilityLabel={`${candidate.name}, ${meta}. ${open.text}. Open in Maps`}
      style={styles.card}
      testID="food-candidate"
    >
      {/* OpenStreetMap carries no photographs, so this is the category illustration, never a stock image. */}
      <VenueImage category={candidate.category} alt="" style={styles.thumb} borderRadius={radius.lg} showCredit={false} />
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>
          {candidate.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
        <Text
          style={[styles.hours, positive && styles.hoursOpen, negative && styles.hoursClosed]}
          numberOfLines={1}
        >
          {open.text}
        </Text>
        <View style={styles.chips}>
          {chips.length > 0 ? (
            chips.slice(0, 2).map((chip) => (
              <View key={chip} style={styles.chip}>
                <Text style={styles.chipText} numberOfLines={1}>
                  {chip}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.unrecorded} numberOfLines={1}>
              Family facilities not recorded
            </Text>
          )}
        </View>
      </View>
      <Ionicons name="open-outline" size={18} color={colors.text.tertiary} style={styles.open} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: RESTAURANT_CARD_WIDTH,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    minHeight: 112,
  },
  thumb: { width: 84, height: 96 },
  body: { flex: 1, gap: 3 },
  name: { fontFamily: 'Inter_600SemiBold', fontSize: 15.5, lineHeight: 19, color: colors.ink, paddingRight: 18 },
  meta: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 16, color: colors.text.secondary },
  hours: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 16, color: colors.text.secondary },
  hoursOpen: { color: colors.secondary[600] },
  hoursClosed: { color: colors.warning[600] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  chip: { backgroundColor: colors.actionSoft, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  chipText: { fontFamily: 'Inter_500Medium', fontSize: 11.5, lineHeight: 15, color: colors.action },
  unrecorded: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 15, color: colors.text.tertiary },
  open: { position: 'absolute', top: spacing.md, right: spacing.md },
});
