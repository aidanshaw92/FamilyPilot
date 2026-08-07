import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient
      colors={[colors.background, colors.primary[50], colors.background]}
      style={[styles.container, { paddingTop: insets.top + spacing['2xl'], paddingBottom: insets.bottom + spacing.xl }]}
    >
      <View style={styles.hero}>
        <View style={styles.iconWrap}>
          <Text variant="display" color={colors.primary[500]}>
            ✦
          </Text>
        </View>

        <Text variant="heading1" style={styles.headline}>
          FamilyPilot helps your family make better everyday decisions with less effort.
        </Text>

        <Text variant="body" color={colors.text.secondary} style={styles.body}>
          Tell us a little about your family and we will personalise every recommendation — with
          clear reasons you can trust.
        </Text>
      </View>

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
    justifyContent: 'space-between',
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing['2xl'],
  },
  headline: {
    lineHeight: 34,
    marginBottom: spacing.lg,
  },
  body: {
    lineHeight: 24,
    maxWidth: 340,
  },
  footer: {
    gap: spacing.md,
  },
  footerNote: {
    textAlign: 'center',
  },
});
