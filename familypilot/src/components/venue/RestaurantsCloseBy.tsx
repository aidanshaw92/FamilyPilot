import { StyleSheet, View } from 'react-native';

import { PlaceAttribution } from '@/src/components/shared/PlaceAttribution';
import { Text } from '@/src/components/ui/Text';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { FoodCandidate, NearbyFoodResult } from '@/src/types/nearby-food';
import { TravelLeg } from '@/src/types/travel';
import { travelSourceOfLeg, travelTimeWithMode } from '@/src/utils/travel-time';

/**
 * "Restaurants close by" on Venue Detail.
 *
 * WHAT THIS DELIBERATELY DOES NOT SHOW. No rating, no photograph, no family score, no "great for
 * kids". OpenStreetMap supplies none of those, and a card that looked like the venue cards elsewhere
 * in the app would imply the same depth of knowledge behind it. The brief's distinction is the whole
 * design here: this is a NEARBY RESTAURANT, not a venue with FAMILY FACILITIES CONFIRMED.
 *
 * What it does show is what OSM actually said, and says plainly which of that is missing. A place
 * with no mapped opening hours reads "hours not listed", not "closed" and not nothing at all, because
 * a parent choosing a lunch stop needs to know the difference between "shut" and "we don't know".
 */

type Props = {
  result?: NearbyFoodResult;
  isPending: boolean;
  isError: boolean;
};

const CATEGORY_NOUN: Record<FoodCandidate['category'], string> = {
  restaurant: 'Restaurant',
  cafe: 'Cafe',
  fast_food: 'Quick bite',
};

/**
 * The travel line, each mode worded by how it was obtained.
 *
 * Walking first when it exists, because a lunch stop you can walk to is the one a parent is most
 * likely to take. Public transport is not listed: the OSM path never produces it, and its absence is
 * stated once below rather than implied by a blank.
 */
function travelLine(travel: TravelLeg[]): string {
  const order: TravelLeg['mode'][] = ['walk', 'drive', 'transit', 'bus', 'cycle'];
  return order
    .map((mode) => travel.find((leg) => leg.mode === mode))
    .filter((leg): leg is TravelLeg => Boolean(leg))
    // Worded from the leg's own provenance, never from an assumption about this path: when a routed
    // value does arrive here, the same component states it plainly without a change.
    .map((leg) => travelTimeWithMode(leg.durationMinutes, travelSourceOfLeg(leg), leg.mode))
    .join(' · ');
}

/** The tags worth telling a parent about, and only when OSM said yes. */
function taggedNotes(candidate: FoodCandidate): string[] {
  const notes: string[] = [];
  if (candidate.tagged.highchair) notes.push('Highchairs');
  if (candidate.tagged.changingTable) notes.push('Baby changing');
  if (candidate.tagged.outdoorSeating) notes.push('Outdoor seating');
  if (candidate.tagged.wheelchair) notes.push('Step-free entrance');
  return notes;
}

export function RestaurantsCloseBy({ result, isPending, isError }: Props) {
  if (isPending) {
    return (
      <View style={styles.section} testID="restaurants-close-by">
        <Text variant="heading2">Restaurants close by</Text>
        <Text variant="bodySmall" color={colors.text.secondary}>
          Looking for places to eat nearby.
        </Text>
      </View>
    );
  }

  // An outage is reported as an outage. Rendering "no restaurants nearby" would turn a failed request
  // into a claim about the neighbourhood, which is the kind of false fact this product exists not to
  // produce.
  if (isError) {
    return (
      <View style={styles.section} testID="restaurants-close-by">
        <Text variant="heading2">Restaurants close by</Text>
        <Text variant="bodySmall" color={colors.text.secondary}>
          We could not check what is nearby just now. This is about our lookup, not about the area.
        </Text>
      </View>
    );
  }

  const candidates = result?.candidates ?? [];

  if (candidates.length === 0) {
    return (
      <View style={styles.section} testID="restaurants-close-by">
        <Text variant="heading2">Restaurants close by</Text>
        <Text variant="bodySmall" color={colors.text.secondary}>
          Nothing to eat is mapped within a short walk of here. There may still be somewhere; it just
          is not on the map we use.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.section} testID="restaurants-close-by">
      <Text variant="heading2">Restaurants close by</Text>
      <Text variant="bodySmall" color={colors.text.secondary} style={styles.caveat}>
        Nearby places to eat. Travel times are estimated from distance, not measured, and we have no
        public transport times for these.
      </Text>

      {candidates.map((candidate) => {
        const notes = taggedNotes(candidate);
        return (
          <View key={candidate.familypilotId} style={styles.row} testID="food-candidate">
            <Text variant="body" style={styles.name} numberOfLines={2}>
              {candidate.name}
            </Text>
            <Text variant="caption" color={colors.text.secondary}>
              {CATEGORY_NOUN[candidate.category]}
              {candidate.cuisine ? ` · ${candidate.cuisine.replace(/[_;]/g, ' ')}` : ''}
              {` · ${travelLine(candidate.travel)}`}
            </Text>
            {candidate.openingHours ? (
              <Text variant="caption" color={colors.text.tertiary}>
                Hours: {candidate.openingHours}
              </Text>
            ) : (
              <Text variant="caption" color={colors.text.tertiary}>
                Hours not listed
              </Text>
            )}
            {notes.length > 0 ? (
              <Text variant="caption" color={colors.text.tertiary}>
                {notes.join(' · ')}
              </Text>
            ) : (
              // Said out loud rather than left blank: a parent should not read an empty line as
              // "there are no highchairs".
              <Text variant="caption" color={colors.text.tertiary}>
                Nobody has recorded facilities for children here
              </Text>
            )}
          </View>
        );
      })}

      {/* The ODbL credit these candidates owe. Every one came from OpenStreetMap. */}
      <PlaceAttribution provider={result?.provider} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm, paddingVertical: spacing.md },
  caveat: { marginBottom: spacing.xs },
  row: {
    gap: 2,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  name: { fontFamily: 'Inter_600SemiBold' },
});
