import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FamilyHeroIllustration } from '@/src/components/onboarding/FamilyHeroIllustration';
import { Button, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { isPilotFeatureVisible, PilotFeature } from '@/src/config/pilot-features';

const BENEFITS: { icon: keyof typeof Ionicons.glyphMap; label: string; feature?: PilotFeature }[] = [
  { icon: 'leaf-outline', label: 'Days out & activities' },
  { icon: 'airplane-outline', label: 'Holidays', feature: 'holiday' },
  { icon: 'car-outline', label: 'Car fit checker', feature: 'car_fit' },
  { icon: 'bag-handle-outline', label: 'Packing lists', feature: 'packing' },
  { icon: 'basket-outline', label: 'Where to buy baby essentials', feature: 'need_now' },
  { icon: 'sparkles-outline', label: 'And so much more…' },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const visibleBenefits = BENEFITS.filter((benefit) => !benefit.feature || isPilotFeatureVisible(benefit.feature));

  return (
    <View
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.lg }]}
    >
      <View style={styles.brandRow}>
        <View style={styles.logoMark}>
          <Ionicons name="heart" size={22} color={colors.text.inverse} />
        </View>
        <Text variant="heading3" style={styles.brandName}>
          FamilyPilot
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Text variant="display" style={styles.headline}>
          The everyday app for family life.
        </Text>

        <View style={styles.illustrationWrap}>
          <FamilyHeroIllustration />
        </View>

        <View style={styles.benefitsList}>
          {visibleBenefits.map((benefit) => (
            <View key={benefit.label} style={styles.benefitRow}>
              <View style={styles.benefitIconWrap}>
                <Ionicons name={benefit.icon} size={18} color={colors.text.primary} />
              </View>
              <Text variant="body" style={styles.benefitLabel}>
                {benefit.label}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Get started"
          size="lg"
          fullWidth
          trailingArrow
          onPress={() => router.push('/(onboarding)/account' as never)}
        />
        <Text variant="caption" color={colors.text.tertiary} style={styles.footerNote}>
          Takes about a minute · You can add more details later
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.screenPadding,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.md,
  },
  logoMark: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.primary[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    letterSpacing: -0.3,
  },
  headline: {
    marginBottom: spacing.xl,
    maxWidth: 300,
  },
  illustrationWrap: {
    aspectRatio: 320 / 220,
    width: '100%',
    marginBottom: spacing['2xl'],
    borderRadius: radius['3xl'],
    overflow: 'hidden',
  },
  benefitsList: {
    gap: spacing.lg,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  benefitIconWrap: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitLabel: {
    flex: 1,
  },
  footer: {
    gap: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  footerNote: {
    textAlign: 'center',
  },
});
