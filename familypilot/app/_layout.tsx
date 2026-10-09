import 'react-native-reanimated';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  Inter_900Black,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '@/src/design-system/tokens';
import { useDocumentTitle } from '@/src/hooks/use-document-title';
import { installClientErrorReporting } from '@/src/services/monitoring/client-errors';
import { accountRequired, useAuthStore } from '@/src/stores/auth-store';
import { useFamilyStore } from '@/src/stores/family-store';

export { AppErrorBoundary as ErrorBoundary } from '@/src/components/AppErrorBoundary';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

/** The routes a signed-out person may be on: Welcome, creating an account, an invitation link, and the About page. */
const SIGNED_OUT_ALLOWED = new Set(['index', '(onboarding)', 'invite', 'about', '+not-found']);

/**
 * Keeps signed-out people out of the app. Every user has an account, so any deep link to a place, a plan or a tab
 * that arrives without a session goes back to the start; the start sends them to Welcome or to signing in.
 */
function useAccountGuard() {
  const router = useRouter();
  const segments = useSegments();
  // `replace` is only safe once the navigator has mounted; before that it is queued against a state that does not exist.
  const navigatorReady = Boolean(useRootNavigationState()?.key);
  const status = useAuthStore((s) => s.status);
  const init = useAuthStore((s) => s.init);
  useEffect(() => {
    init();
  }, [init]);
  const first = (segments[0] as string | undefined) ?? 'index';
  // The router object changes identity as navigation settles, so it is read through a ref: depending on it re-ran this
  // effect on every transition and the redirect never let the navigation state rest.
  const routerRef = useRef(router);
  routerRef.current = router;
  const sentBack = useRef<string | null>(null);
  useEffect(() => {
    if (!navigatorReady || !accountRequired() || status !== 'signed_out') {
      if (status !== 'signed_out') sentBack.current = null;
      return;
    }
    if (SIGNED_OUT_ALLOWED.has(first)) {
      sentBack.current = null;
      return;
    }
    if (sentBack.current === first) return;
    sentBack.current = first;
    // Straight to where signed-out people belong. Replacing with '/' resolves to the tabs' own index from inside the
    // tabs, which keeps the same segment and never leaves.
    routerRef.current.replace(
      (useFamilyStore.getState().hasCompletedOnboarding ? '/(onboarding)/account?mode=signin' : '/(onboarding)/welcome') as never,
    );
  }, [status, first, navigatorReady]);
}

export default function RootLayout() {
  useDocumentTitle();
  useAccountGuard();
  useEffect(() => installClientErrorReporting(), []);
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Inter_900Black,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      void SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="index" options={{ animation: 'fade' }} />
            <Stack.Screen name="(onboarding)" options={{ animation: 'fade', gestureEnabled: false }} />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="invite/[code]" options={{ animation: 'fade' }} />
            <Stack.Screen name="profile/edit" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="about" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="families" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen
              name="venue/[id]"
              options={{ animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="restaurant/[id]"
              options={{ animation: 'slide_from_bottom' }}
            />
            <Stack.Screen name="need-now" />
            <Stack.Screen name="holiday" />
            <Stack.Screen name="packing" />
            <Stack.Screen name="car-fit" />
            <Stack.Screen name="feedback" />
            <Stack.Screen name="internal" options={{ headerShown: false }} />
            <Stack.Screen name="concierge" options={{ presentation: 'modal' }} />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
