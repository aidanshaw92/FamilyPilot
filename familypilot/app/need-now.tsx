import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StoreCard } from '@/src/components/shared/StoreCard';
import { BackButton } from '@/src/components/ui/BackButton';
import { Chip, EmptyState, Text } from '@/src/components/ui';
import { colors, spacing } from '@/src/design-system/tokens';
import { useNearbyStores } from '@/src/hooks/use-queries';

const QUICK_FILTERS = ['Formula', 'Wipes', 'Nappies', 'Calpol', 'Medicine'];

export default function NeedNowScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: stores, isLoading, isError } = useNearbyStores();
  const [activeFilter, setActiveFilter] = useState(QUICK_FILTERS[0]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)' as never);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackButton onPress={handleBack} />
        <View style={styles.headerText}>
          <Text variant="heading1">Need something now?</Text>
          <Text variant="bodySmall" color={colors.text.secondary}>
            Open nearby · Estimated availability
          </Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {QUICK_FILTERS.map((filter) => (
          <Chip
            key={filter}
            label={filter}
            active={activeFilter === filter}
            onPress={() => setActiveFilter(filter)}
          />
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="heading3" style={styles.sectionTitle}>
          Nearest places
        </Text>

        {isError ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="Store data unavailable"
            message="We could not load nearby shops. Try again in a moment."
          />
        ) : isLoading ? (
          <Text variant="bodySmall" color={colors.text.secondary}>
            Finding nearby shops…
          </Text>
        ) : !stores || stores.length === 0 ? (
          <EmptyState
            icon="storefront-outline"
            title="No nearby shops"
            message="We could not find open shops near you right now."
          />
        ) : (
          stores.map((store) => <StoreCard key={store.id} store={store} />)
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
  },
  filters: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: spacing.lg,
    alignItems: 'center',
  },
  content: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: spacing['3xl'],
  },
  sectionTitle: {
    marginBottom: spacing.lg,
  },
});
