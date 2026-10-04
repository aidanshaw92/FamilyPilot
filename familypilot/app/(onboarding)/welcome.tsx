import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BenefitCard } from '@/src/components/onboarding/BenefitCard';
import { Button, Doodle, PhotoSlot, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { WELCOME_BENEFITS, WELCOME_COLLAGE, WELCOME_DESIGN_WIDTH, WELCOME_DOODLES } from '@/src/utils/welcome-layout';

/**
 * Welcome, to the identity reference and Figma frame "05 — Welcome v2": the wordmark, the headline,
 * a collage of editorial photograph slots with the decorative marks between them, three benefit
 * cards, and "Get started". The photographs are slots (see `PhotoSlot`) until the product owns
 * licensed ones; the logo mark is a placeholder until the owner picks a direction.
 */
export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // The frame is drawn at 393 wide. The collage scales with the phone; the type does not. Past a
  // large phone it stops growing, so a tablet gets the same composition rather than a giant one.
  const k = Math.min(width, 480) / WELCOME_DESIGN_WIDTH;
  const start = () => router.push('/(onboarding)/setup' as never);

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.logoMark}>
              <Ionicons name="heart" size={22} color={colors.text.inverse} />
            </View>
            <Text variant="heading2" style={styles.brandName}>
              Family
              <Text variant="heading2" color={colors.action} style={styles.brandName}>
                Pilot
              </Text>
            </Text>
            <Doodle kind="strokes" tint="yellow" size={30} style={styles.brandStrokes} />
          </View>

          <Text variant="display" style={[styles.headline, { maxWidth: Math.round(300 * k) }]}>
            The everyday app for family life
            <Text variant="display" color={colors.action}>
              .
            </Text>
          </Text>
          <Text variant="body" color={colors.text.secondary} style={styles.subtitle}>
            Personalised days out, activities and recommendations for your family.
          </Text>

          {/* The one slot in the header, bleeding off the top-right corner as the reference's does.
              It sits beside the brand row, above the headline's first line, so the headline never
              runs under it at 360; the header clips it so the page never scrolls sideways. */}
          <PhotoSlot
            category="zoo"
            shape="circle"
            icon="paw-outline"
            testID="welcome-slot-zoo"
            style={{ width: 100 * k, height: 100 * k, right: -22 * k, top: -10 }}
          />
        </View>

        <View style={[styles.collage, { height: Math.round(WELCOME_COLLAGE.height * k) }]}>
          {WELCOME_COLLAGE.slots.map((slot) => (
            <PhotoSlot
              key={slot.id}
              category={slot.category}
              shape={slot.shape}
              icon={slot.icon}
              testID={`welcome-slot-${slot.id}`}
              style={{ left: slot.x * k, top: slot.y * k, width: slot.w * k, height: slot.h * k }}
            />
          ))}
          {WELCOME_DOODLES.map((mark) => (
            <Doodle
              key={mark.id}
              kind={mark.kind}
              tint={mark.tint}
              size={mark.size * k}
              rotate={mark.rotate}
              style={{ left: mark.x * k, top: mark.y * k }}
            />
          ))}
        </View>

        <View style={styles.benefits}>
          {WELCOME_BENEFITS.map((benefit) => (
            <BenefitCard key={benefit.title} {...benefit} onPress={start} />
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button label="Get started" size="lg" fullWidth trailingIcon="arrow-forward" onPress={start} />
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
  },
  scrollContent: {
    paddingBottom: spacing.lg,
  },
  header: {
    paddingHorizontal: spacing['2xl'],
    overflow: 'hidden',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.lg,
  },
  logoMark: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.action,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    letterSpacing: -0.3,
  },
  brandStrokes: {
    position: 'relative',
    marginLeft: spacing.xs,
    marginBottom: spacing.md,
  },
  headline: {
    marginTop: spacing['2xl'],
  },
  subtitle: {
    marginTop: spacing.md,
    maxWidth: 320,
  },
  collage: {
    marginTop: spacing.lg,
    width: '100%',
    overflow: 'hidden',
  },
  benefits: {
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing.sm,
    gap: 10,
  },
  footer: {
    gap: spacing.md,
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  footerNote: {
    textAlign: 'center',
  },
});
