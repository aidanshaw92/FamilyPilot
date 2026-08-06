import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/src/components/ui/BackButton';
import { Card, Chip, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { useNearbyStores } from '@/src/hooks/use-queries';

const QUICK_FILTERS = ['Formula', 'Wipes', 'Nappies', 'Calpol', 'Medicine'];

const BRAND_COLORS: Record<string, string> = {
  tesco: '#00539F',
  sainsburys: '#F06C00',
  boots: '#0054A4',
  aldi: '#00005F',
  superdrug: '#EE0088',
};

export default function NeedNowScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: stores } = useNearbyStores();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackButton onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text variant="heading1">Need something now?</Text>
          <Text variant="bodySmall">Open nearby · In stock</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {QUICK_FILTERS.map((filter, index) => (
          <Chip key={filter} label={filter} active={index === 0} />
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="heading3" style={styles.sectionTitle}>
          Nearest places
        </Text>
        {stores?.map((store) => (
          <Card key={store.id} style={styles.storeCard}>
            <View style={styles.storeHeader}>
              <View
                style={[
                  styles.brandDot,
                  { backgroundColor: BRAND_COLORS[store.brand] ?? colors.primary[500] },
                ]}
              />
              <View style={styles.storeInfo}>
                <Text variant="heading3">{store.name}</Text>
                <View style={styles.storeMeta}>
                  <Ionicons name="car-outline" size={14} color={colors.text.tertiary} />
                  <Text variant="caption">{store.driveMinutes} min</Text>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: store.isOpen ? colors.secondary[100] : colors.error[100] },
                    ]}
                  >
                    <Text
                      variant="caption"
                      color={store.isOpen ? colors.secondary[600] : colors.error[600]}
                    >
                      {store.isOpen ? `Open · Closes ${store.closesAt}` : 'Closed'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
            {store.stockNotes.map((note) => (
              <View key={note} style={styles.stockRow}>
                <Ionicons name="checkmark-circle" size={16} color={colors.secondary[500]} />
                <Text variant="bodySmall" style={styles.stockText}>
                  {note}
                </Text>
              </View>
            ))}
          </Card>
        ))}
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
  },
  content: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: spacing['5xl'],
  },
  sectionTitle: {
    marginBottom: spacing.lg,
  },
  storeCard: {
    marginBottom: spacing.lg,
  },
  storeHeader: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  brandDot: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    marginRight: spacing.md,
  },
  storeInfo: {
    flex: 1,
  },
  storeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
    flexWrap: 'wrap',
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  stockText: {
    flex: 1,
    color: colors.text.secondary,
  },
});
