import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BootVisualisation } from '@/src/components/car-fit/BootVisualisation';
import { BackButton } from '@/src/components/ui/BackButton';
import { Button, Card, EmptyState, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { useCarFit } from '@/src/hooks/use-queries';

export default function CarFitScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: carFit, isLoading, isError } = useCarFit();

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)' as never);
    }
  };

  if (isError) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <BackButton onPress={handleBack} />
        <EmptyState
          icon="car-outline"
          title="Unable to calculate"
          message="We could not load your car fit data. Try again later."
        />
      </View>
    );
  }

  if (isLoading || !carFit) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <BackButton onPress={handleBack} />
        <Text variant="bodySmall" color={colors.text.secondary} style={styles.loading}>
          Calculating fit…
        </Text>
      </View>
    );
  }

  const usedLitres = carFit.equipment.reduce((sum, e) => sum + e.volumeLitres, 0);
  const usedPercent = (usedLitres / carFit.bootCapacityLitres) * 100;

  const handleShare = () => {
    void Share.share({
      message: `Car fit check: ${carFit.allFits ? 'Everything fits' : 'Needs roof box'} in ${carFit.carName}. ${usedLitres}L of ${carFit.bootCapacityLitres}L used (estimate).`,
    });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackButton onPress={handleBack} />
        <View style={styles.headerText}>
          <Text variant="heading1">Car fit checker</Text>
          <Text variant="bodySmall" color={colors.text.secondary}>
            {carFit.carName}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.statusCard}>
          <View
            style={[
              styles.statusIcon,
              {
                backgroundColor: carFit.allFits
                  ? colors.secondary[100]
                  : colors.warning[100],
              },
            ]}
          >
            <Ionicons
              name={carFit.allFits ? 'checkmark-circle' : 'warning'}
              size={32}
              color={carFit.allFits ? colors.secondary[500] : colors.warning[500]}
            />
          </View>
          <Text variant="heading2">
            {carFit.allFits ? 'Everything fits!' : 'Need a roof box'}
          </Text>
          <Text variant="bodySmall" color={colors.text.secondary} style={styles.statusSub}>
            {carFit.allFits
              ? `You'll have approx. ${carFit.spareLitres}L spare space (estimate)`
              : 'Some items exceed estimated boot capacity'}
          </Text>

          <View style={styles.capacityBar}>
            <View style={[styles.capacityFill, { width: `${usedPercent}%` }]} />
          </View>
          <Text variant="caption" color={colors.text.secondary}>
            {usedLitres}L of {carFit.bootCapacityLitres}L used
          </Text>
        </Card>

        <BootVisualisation
          equipment={carFit.equipment}
          capacityLitres={carFit.bootCapacityLitres}
          usedLitres={usedLitres}
        />

        <Text variant="heading3" style={styles.sectionTitle}>
          Your items
        </Text>
        {carFit.equipment.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <Text variant="body" style={styles.itemName}>
              {item.name}
            </Text>
            <Text variant="bodySmall" color={colors.text.secondary}>
              {item.volumeLitres}L
            </Text>
            <View
              style={[
                styles.fitsBadge,
                { backgroundColor: item.fits ? colors.secondary[100] : colors.error[100] },
              ]}
            >
              <Text
                variant="caption"
                color={item.fits ? colors.secondary[600] : colors.error[600]}
              >
                {item.fits ? 'Fits' : 'No'}
              </Text>
            </View>
          </View>
        ))}

        <View style={styles.actions}>
          <Button label="Recalculate" variant="outline" style={styles.actionButton} />
          <Button label="Share summary" onPress={handleShare} style={styles.actionButton} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loading: {
    padding: spacing.screenPadding,
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
  content: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: spacing['3xl'],
  },
  statusCard: {
    alignItems: 'center',
    marginBottom: spacing['2xl'],
  },
  statusIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  statusSub: {
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  capacityBar: {
    width: '100%',
    height: 8,
    backgroundColor: colors.borderLight,
    borderRadius: radius.full,
    marginTop: spacing['2xl'],
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  capacityFill: {
    height: '100%',
    backgroundColor: colors.secondary[500],
    borderRadius: radius.full,
  },
  sectionTitle: {
    marginBottom: spacing.lg,
    marginTop: spacing['2xl'],
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: spacing.md,
  },
  itemName: {
    flex: 1,
  },
  fitsBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing['2xl'],
  },
  actionButton: {
    flex: 1,
  },
});
