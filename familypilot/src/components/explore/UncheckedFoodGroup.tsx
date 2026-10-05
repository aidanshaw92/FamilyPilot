import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Text } from '@/src/components/ui';
import { DecisionCard } from '@/src/components/shared/DecisionCard';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { Venue } from '@/src/types';

/**
 * Under a food-filtered list: the places the filter could not judge.
 *
 * "No match" and "we haven't looked" are different answers and a parent must be able to tell them apart. A place
 * whose food nearby has not been looked up is not a place without food, so it is not hidden: it is listed here, said
 * plainly, one tap away.
 */
export function UncheckedFoodGroup({ venues, matched }: { venues: Venue[]; matched: number }) {
  const [open, setOpen] = useState(false);
  if (venues.length === 0) return null;
  return (
    <View style={styles.box} testID="unchecked-food-group">
      <Text variant="heading3">{matched === 0 ? 'No place is known to match yet' : 'Not checked for food yet'}</Text>
      <Text variant="bodySmall" color={colors.text.secondary}>
        {venues.length === 1 ? '1 place hasn’t' : `${venues.length} places haven’t`} been checked for food nearby, so we can’t say either way.
        They aren’t a “no”, they are simply not looked up yet.
      </Text>
      <Button
        label={open ? 'Hide them' : venues.length === 1 ? 'Show it' : `Show ${venues.length} places`}
        variant="outline"
        size="sm"
        onPress={() => setOpen((v) => !v)}
        testID="unchecked-food-toggle"
      />
      {open ? (
        <View style={styles.list}>
          {venues.map((venue, index) => (
            <DecisionCard key={venue.id} venue={venue} variant="list" index={index} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm, backgroundColor: colors.fill, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.md },
  list: { gap: spacing.md, marginTop: spacing.sm },
});
