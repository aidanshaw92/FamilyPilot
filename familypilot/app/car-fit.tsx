import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/src/components/ui/BackButton';
import { Card, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { useCarFit } from '@/src/hooks/use-queries';

export default function CarFitScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: carFit } = useCarFit();

  if (!carFit) return null;

  const usedLitres = carFit.equipment.reduce((sum, e) => sum + e.volumeLitres, 0);
  const usedPercent = (usedLitres / carFit.bootCapacityLitres) * 100;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackButton onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text variant="heading1">Car fit checker</Text>
          <Text variant="bodySmall">{carFit.carName}</Text>
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
          <Text variant="bodySmall" style={styles.statusSub}>
            {carFit.allFits
              ? `You'll have approx. ${carFit.spareLitres}L spare space`
              : 'Some items exceed boot capacity'}
          </Text>

          <View style={styles.capacityBar}>
            <View style={[styles.capacityFill, { width: `${usedPercent}%` }]} />
          </View>
          <Text variant="caption">
            {usedLitres}L of {carFit.bootCapacityLitres}L used
          </Text>
        </Card>

        <Text variant="heading3" style={styles.sectionTitle}>
          Your items
        </Text>
        {carFit.equipment.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <Text variant="body" style={styles.itemName}>
              {item.name}
            </Text>
            <Text variant="bodySmall" color={colors.text.tertiary}>
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

        <Image
          source={{
            uri: 'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=800&q=80',
          }}
          style={styles.bootImage}
          contentFit="cover"
        />
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
  content: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: spacing['5xl'],
  },
  statusCard: {
    alignItems: 'center',
    marginBottom: spacing['3xl'],
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
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  bootImage: {
    width: '100%',
    height: 200,
    borderRadius: radius.lg,
    marginTop: spacing['2xl'],
  },
});
