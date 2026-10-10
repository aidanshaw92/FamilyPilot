import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors } from '@/src/design-system/tokens';
import { initialAuthLinkError } from '@/src/services/supabase/client';
import { useAuthStore, accountRequired } from '@/src/stores/auth-store';
import { useFamilyStore } from '@/src/stores/family-store';
import { usePendingInviteStore } from '@/src/stores/pending-invite-store';

export default function Index() {
  const hasCompletedOnboarding = useFamilyStore((s) => s.hasCompletedOnboarding);
  const hasSeenSplash = useFamilyStore((s) => s.hasSeenSplash);
  const hasHydrated = useFamilyStore((s) => s._hasHydrated);
  const [ready, setReady] = useState(hasHydrated);
  const authStatus = useAuthStore((s) => s.status);
  const initAuth = useAuthStore((s) => s.init);
  const pendingInvite = usePendingInviteStore((s) => s.code);
  const inviteHydrated = usePendingInviteStore((s) => s.hydrated);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  useEffect(() => {
    if (useFamilyStore.persist.hasHydrated()) {
      setReady(true);
      return;
    }

    return useFamilyStore.persist.onFinishHydration(() => {
      setReady(true);
    });
  }, []);

  const needsAccount = accountRequired();
  if (!ready || (needsAccount && authStatus === 'loading') || !inviteHydrated) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.action} />
      </View>
    );
  }

  // Every user has an account. Signed out, a first-time visitor goes through Welcome to create one; someone who has
  // already set their family up goes straight to signing back in. Signed in and not yet set up, on to the family.
  if (needsAccount && authStatus === 'signed_out') {
    // A link that could not be used (expired, already used, tampered with) explains itself on the sign-in screen.
    if (hasCompletedOnboarding || initialAuthLinkError) return <Redirect href={{ pathname: '/(onboarding)/account', params: { mode: 'signin' } } as never} />;
    return <Redirect href={hasSeenSplash ? '/(onboarding)/welcome' : '/(onboarding)/splash'} />;
  }

  if (hasCompletedOnboarding) {
    // An invitation opened before the account existed is picked up once everything it needs does.
    if (pendingInvite) return <Redirect href={`/invite/${pendingInvite}` as never} />;
    return <Redirect href="/(tabs)" />;
  }

  if (needsAccount && authStatus === 'signed_in') return <Redirect href="/(onboarding)/setup" />;

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
