import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors } from '@/src/design-system/tokens';
import { useFamilyStore } from '@/src/stores/family-store';

export default function Index() {
  const hasCompletedOnboarding = useFamilyStore((s) => s.hasCompletedOnboarding);
  const hasSeenSplash = useFamilyStore((s) => s.hasSeenSplash);
  const hasHydrated = useFamilyStore((s) => s._hasHydrated);
  const [ready, setReady] = useState(hasHydrated);

  useEffect(() => {
    if (useFamilyStore.persist.hasHydrated()) {
      setReady(true);
      return;
    }

    return useFamilyStore.persist.onFinishHydration(() => {
      setReady(true);
    });
  }, []);

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }

  if (hasCompletedOnboarding) {
    return <Redirect href="/(tabs)" />;
  }

  if (!hasSeenSplash) {
    return <Redirect href="/(onboarding)/splash" />;
  }

  return <Redirect href="/(onboarding)/welcome" />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
