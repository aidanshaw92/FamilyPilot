import { ScrollView, StyleSheet, View } from 'react-native';

import { DecisionCard } from '@/src/components/shared/DecisionCard';
import { ScreenContainer } from '@/src/components/shared/ScreenContainer';
import { EmptyState, FadeInView, Text } from '@/src/components/ui';
import { spacing } from '@/src/design-system/tokens';
import { useSavedItems } from '@/src/hooks/use-queries';

const CATEGORY_LABELS: Record<string, string> = {
  place: 'Places',
  restaurant: 'Restaurants',
  hotel: 'Hotels',
  shop: 'Shops',
};

export default function SavedScreen() {
  const { data: savedItems, isLoading } = useSavedItems();

  const grouped = savedItems?.reduce<Record<string, NonNullable<typeof savedItems>>>((acc, item) => {
    const key = item.type;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {}) ?? {};

  const isEmpty = !isLoading && Object.keys(grouped).length === 0;

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text variant="heading1">Saved</Text>
        <Text variant="bodySmall" style={styles.subtitle}>
          Places you love
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {isEmpty ? (
          <EmptyState
            icon="heart-outline"
            title="Nothing saved yet"
            message="Tap the heart on any place to save it for later."
          />
        ) : (
          Object.entries(grouped).map(([type, items], sectionIndex) => (
            <FadeInView key={type} delay={sectionIndex * 60}>
              <View style={styles.section}>
                <Text variant="heading3" style={styles.sectionTitle}>
                  {CATEGORY_LABELS[type] ?? type}
                </Text>
                {items.map((item, index) => (
                  <DecisionCard key={item.id} venue={item.venue} variant="list" index={index} />
                ))}
              </View>
            </FadeInView>
          ))
        )}
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
