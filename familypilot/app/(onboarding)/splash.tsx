import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/src/components/ui';
import { colors, spacing } from '@/src/design-system/tokens';
import { useFamilyStore } from '@/src/stores/family-store';

export default function SplashScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const markSplashSeen = useFamilyStore((s) => s.markSplashSeen);

  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.92);
  const taglineOpacity = useSharedValue(0);

  useEffect(() => {
    logoOpacity.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
    logoScale.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
    taglineOpacity.value = withDelay(
      400,
      withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }),
    );

    const timer = setTimeout(() => {
      markSplashSeen();
      router.replace('/(onboarding)/welcome' as never);
    }, 2200);

    return () => clearTimeout(timer);
  }, [logoOpacity, logoScale, markSplashSeen, router, taglineOpacity]);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const taglineStyle = useAnimatedStyle(() => ({
    opacity: taglineOpacity.value,
  }));

  return (
    <LinearGradient
      colors={[colors.primary[700], colors.primary[500], colors.secondary[500]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
    >
      <View style={styles.content}>
        <Animated.View style={logoStyle}>
          <View style={styles.logoMark}>
            <Text variant="display" color={colors.text.inverse} style={styles.logoLetter}>
              F
            </Text>
          </View>
          <Text variant="display" color={colors.text.inverse} style={styles.brand}>
            FamilyPilot
          </Text>
        </Animated.View>

        <Animated.View style={taglineStyle}>
          <Text variant="body" color="rgba(255,255,255,0.88)" style={styles.tagline}>
            Confident family decisions
          </Text>
        </Animated.View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.screenPadding,
  },
  logoMark: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  logoLetter: {
    fontSize: 36,
  },
  brand: {
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  tagline: {
    marginTop: spacing.lg,
    textAlign: 'center',
  },
});
