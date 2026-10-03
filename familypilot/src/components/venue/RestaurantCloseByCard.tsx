import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { VenueImage } from '@/src/components/ui/VenueImage';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { FoodCandidate } from '@/src/types/nearby-food';
import { CATEGORY_NOUN, restaurantFactsLine, restaurantHoursLine, restaurantTravelLine } from '@/src/utils/restaurant-card-lines';

/** Frame 02's restaurant card (node 51:2): 262 wide, 200 photo, name, meta line, facts line, arrow. */
export const RESTAURANT_CARD_WIDTH = 262;

export function RestaurantCloseByCard({ candidate }: { candidate: FoodCandidate }) {
  const travel = restaurantTravelLine(candidate.travel);
  const noun = candidate.cuisine ? candidate.cuisine.replace(/[_;]/g, ' ') : CATEGORY_NOUN[candidate.category];
  const meta = [travel, noun].filter(Boolean).join(' · ');
  const facts = restaurantFactsLine(candidate);
  const hours = restaurantHoursLine(candidate);
  const openInMaps = () => {
    const query = encodeURIComponent(`${candidate.name} ${candidate.address ?? ''}`.trim());
    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
  };

  return (
    <View style={styles.card} testID="food-candidate">
      {/* OpenStreetMap carries no photographs, so this is the category placeholder, never a stock image. */}
      <VenueImage category={candidate.category} alt={candidate.name} style={styles.photo} borderRadius={radius.xl} />
      <View style={styles.body}>
        <View style={styles.text}>
          <Text style={styles.name} numberOfLines={2}>
            {candidate.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
          <Text style={[styles.facts, !facts.recorded && styles.factsUnknown]} numberOfLines={1}>
            {facts.text}
          </Text>
          {/* Said either way: a missing hours line reads as "open whenever", which nobody checked. */}
          <Text style={styles.hours} numberOfLines={1}>
            {hours.text}
          </Text>
        </View>
        <Pressable
          onPress={openInMaps}
          accessibilityRole="button"
          accessibilityLabel={`Open ${candidate.name} in Maps`}
          hitSlop={6}
          style={styles.open}
        >
          <Ionicons name="arrow-forward" size={18} color={colors.text.inverse} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: RESTAURANT_CARD_WIDTH },
  photo: { width: RESTAURANT_CARD_WIDTH, height: 200 },
  body: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingTop: spacing.lg },
  text: { flex: 1, gap: 6 },
  name: { fontFamily: 'Inter_600SemiBold', fontSize: 17, lineHeight: 21, color: colors.ink },
  meta: { fontFamily: 'Inter_400Regular', fontSize: 13.5, lineHeight: 16, color: colors.text.secondary },
  facts: { fontFamily: 'Inter_500Medium', fontSize: 13.5, lineHeight: 16, color: colors.ink },
  factsUnknown: { fontFamily: 'Inter_400Regular', color: colors.text.tertiary },
  hours: { fontFamily: 'Inter_400Regular', fontSize: 12.5, lineHeight: 15, color: colors.text.tertiary },
  open: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
});
