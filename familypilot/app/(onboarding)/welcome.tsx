import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FamilyHeroIllustration } from '@/src/components/onboarding/FamilyHeroIllustration';
import { Button, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';

const BENEFITS: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { icon: 'leaf-outline', label: 'Days out & activities' },
  { icon: 'airplane-outline', label: 'Holidays' },
  { icon: 'car-outline', label: 'Car fit checker' },
  { icon: 'bag-handle-outline', label: 'Packing lists' },
  { icon: 'basket-outline', label: 'Where to buy baby essentials' },
  { icon: 'sparkles-outline', label: 'And so much more…' },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient
      colors={[colors.background, colors.primary[50], colors.background]}
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.brandRow}>
          <View style={styles.logoMark}>
            <Ionicons name="heart" size={22} color={colors.text.inverse} />
          </View>
          <View>
            <Text variant="heading2" style={styles.brandName}>
              FamilyPilot
            </Text>
            <Text variant="bodySmall" color={colors.text.secondary}>
              The everyday app for family life
            </Text>
          </View>
        </View>

        <View style={styles.illustrationWrap}>
          <FamilyHeroIllustration />
        </View>

        <View style={styles.benefitsList}>
          {BENEFITS.map((benefit) => (
            <View key={benefit.label} style={styles.benefitRow}>
              <View style={styles.benefitIconWrap}>
                <Ionicons name={benefit.icon} size={18} color={colors.primary[600]} />
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
          onPress={() => router.push('/(onboarding)/setup' as never)}
        />
        <Text variant="caption" color={colors.text.tertiary} style={styles.footerNote}>
          Takes about a minute · You can add more details later
        </Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.screenPadding,
  },
  scrollContent: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  logoMark: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.primary[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    letterSpacing: -0.3,
  },
  illustrationWrap: {
    aspectRatio: 320 / 200,
    width: '100%',
    marginBottom: spacing.xl,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  benefitsList: {
    gap: spacing.md,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  benefitIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitLabel: {
    flex: 1,
  },
  footer: {
    gap: spacing.md,
    paddingTop: spacing.md,
  },
  footerNote: {
    textAlign: 'center',
  },
});
