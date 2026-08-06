import { ScrollView, StyleSheet, View } from 'react-native';

import { VenueCard } from '@/src/components/shared/VenueCard';
import { ScreenContainer } from '@/src/components/shared/ScreenContainer';
import { Text } from '@/src/components/ui';
import { spacing } from '@/src/design-system/tokens';
import { useSavedItems } from '@/src/hooks/use-queries';

const CATEGORY_LABELS: Record<string, string> = {
  place: 'Places',
  restaurant: 'Restaurants',
  hotel: 'Hotels',
  shop: 'Shops',
};

export default function SavedScreen() {
  const { data: savedItems } = useSavedItems();

  const grouped = savedItems?.reduce<Record<string, typeof savedItems>>((acc, item) => {
    const key = item.type;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {}) ?? {};

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text variant="heading1">Saved</Text>
        <Text variant="bodySmall" style={styles.subtitle}>
          Your favourite places and plans
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {Object.entries(grouped).map(([type, items]) => (
          <View key={type} style={styles.section}>
            <Text variant="heading3" style={styles.sectionTitle}>
              {CATEGORY_LABELS[type] ?? type}
            </Text>
            {items.map((item) => (
              <VenueCard key={item.id} venue={item.venue} variant="list" />
            ))}
          </View>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.lg,
  },
  subtitle: {
    marginTop: spacing.xs,
  },
  content: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing['2xl'],
    paddingBottom: spacing['5xl'],
  },
  section: {
    marginBottom: spacing['2xl'],
  },
  sectionTitle: {
    marginBottom: spacing.lg,
  },
});
