import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/src/components/ui/BackButton';
import { Card, EmptyState, FamilyMatch, Text } from '@/src/components/ui';
import { OfferCard } from '@/src/components/shared/OfferCard';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { useHolidayOffers } from '@/src/hooks/use-queries';

export default function HolidayScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: offers, isLoading, isError } = useHolidayOffers();

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)' as never);
    }
  };

  const recommended = offers?.find((o) => o.recommended);
  const lowestPrice = offers ? Math.min(...offers.map((o) => o.price)) : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackButton onPress={handleBack} />
        <View style={styles.headerText}>
          <Text variant="heading1">Plan a holiday</Text>
          <Text variant="bodySmall" color={colors.text.secondary}>
            Tenerife, Spain · Aug 2026
          </Text>
        </View>
      </View>

      {isError ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Comparison unavailable"
          message="We could not load holiday offers right now."
        />
      ) : isLoading ? (
        <Text variant="bodySmall" color={colors.text.secondary} style={styles.loading}>
          Comparing offers…
        </Text>
      ) : !offers || offers.length === 0 ? (
        <EmptyState
          icon="airplane-outline"
          title="No matching offers"
          message="Try adjusting your dates or destination."
        />
      ) : (
        <>
          {recommended ? (
            <Card style={styles.comparisonSummary}>
              <Text variant="label" color={colors.primary[500]}>
                Comparison summary
              </Text>
              <View style={styles.summaryGrid}>
                <SummaryItem label="Best price" value={`£${lowestPrice.toLocaleString()}`} />
                <SummaryItem label="Luggage" value="22kg included" />
                <SummaryItem label="Transfer" value="~25 min" />
                <SummaryItem label="Child facilities" value="Kids club (4+)" />
              </View>
              <View style={styles.recommendRow}>
                <FamilyMatch score={recommended.familyScore.score} variant="compact" />
                <Text variant="bodySmall" color={colors.text.secondary} style={styles.recommendText}>
                  Best value: {recommended.familyScore.explanation[0]}
                </Text>
              </View>
            </Card>
          ) : null}

          <ScrollView contentContainerStyle={styles.content}>
            {offers.map((offer) => (
              <OfferCard key={offer.id} offer={offer} />
            ))}
          </ScrollView>
        </>
      )}
    </View>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text variant="caption" color={colors.text.secondary}>
        {label}
      </Text>
      <Text variant="bodySmall" style={styles.summaryValue}>
        {value}
      </Text>
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
  loading: {
    padding: spacing.screenPadding,
  },
  comparisonSummary: {
    marginHorizontal: spacing.screenPadding,
    marginBottom: spacing.lg,
    backgroundColor: colors.primary[50],
    borderColor: colors.primary[100],
    borderWidth: 1,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  summaryItem: {
    width: '45%',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  summaryValue: {
    fontFamily: 'Inter_600SemiBold',
    marginTop: spacing.xs,
  },
  recommendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  recommendText: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: spacing['3xl'],
  },
});
