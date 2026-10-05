import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text } from '@/src/components/ui';
import { BrandMark } from '@/src/components/ui/BrandMark';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { InviteError, acceptInvite, previewInvite } from '@/src/services/planning/connection-invites';
import { isInviteCode } from '@/src/services/planning/invite-links';
import { useAuthStore } from '@/src/stores/auth-store';
import { useFamilyStore } from '@/src/stores/family-store';
import { usePendingInviteStore } from '@/src/stores/pending-invite-store';

/**
 * Where an invitation link lands.
 *
 * Before anyone is signed in this shows only whether the link still works and the label the inviter chose for their
 * family. To accept, a person needs an account and a family of their own (their details are what the inviter gets in
 * return), so the link's code is remembered on this device while they create one, and they come back here to accept
 * with the plain terms in front of them. Nothing is shared by opening the link; nothing is shared until "Accept".
 */
type View_ =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'ready'; label: string }
  | { kind: 'accepted'; label: string }
  | { kind: 'error'; message: string };

const WHAT_IS_SHARED = [
  'Your family’s first name',
  'Your area, to about a kilometre',
  'Your children’s ages (never their names or birthdays)',
  'Your drive limit, budget and the facilities you need',
];

export default function InviteLanding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = typeof raw === 'string' ? raw.toLowerCase() : '';
  const authStatus = useAuthStore((s) => s.status);
  const hasCompletedOnboarding = useFamilyStore((s) => s.hasCompletedOnboarding);
  const profile = useFamilyStore((s) => s.profile);
  const setPending = usePendingInviteStore((s) => s.setCode);
  const clearPending = usePendingInviteStore((s) => s.clear);
  const [view, setView] = useState<View_>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isInviteCode(code)) return setView({ kind: 'invalid' });
    // Remembered straight away, so the code survives sign-up, an email round-trip and describing the family.
    setPending(code);
    let live = true;
    previewInvite(code)
      .then((result) => {
        if (!live) return;
        if (!result.valid) {
          clearPending();
          setView({ kind: 'invalid' });
        } else {
          setView({ kind: 'ready', label: result.label });
        }
      })
      .catch((e) => live && setView({ kind: 'error', message: e instanceof Error ? e.message : 'Could not check the invitation.' }));
    return () => {
      live = false;
    };
  }, [code, setPending, clearPending]);

  const signedIn = authStatus === 'signed_in' || authStatus === 'disabled';
  const ready = view.kind === 'ready' ? view : null;

  const accept = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { inviterLabel } = await acceptInvite(code, profile);
      clearPending();
      setView({ kind: 'accepted', label: inviterLabel });
    } catch (e) {
      const failure = e instanceof InviteError ? e.failure : 'unavailable';
      if (failure === 'expired') {
        clearPending();
        setView({ kind: 'invalid' });
      } else {
        setView({ kind: 'error', message: e instanceof Error ? e.message : 'Could not accept the invitation.' });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.flex, { paddingTop: insets.top, paddingBottom: insets.bottom }]} testID="invite-landing">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <BrandMark tone="light" size={40} />

        {view.kind === 'loading' ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.action} />
            <Text variant="body" color={colors.text.secondary}>
              Checking your invitation…
            </Text>
          </View>
        ) : null}

        {view.kind === 'invalid' ? (
          <>
            <Text variant="heading1" accessibilityRole="header">
              This invitation can’t be used
            </Text>
            <Text variant="body" color={colors.text.secondary}>
              It may have expired, been used already, or been cancelled. Each invitation works once and lasts seven days.
              Ask them to send a new one.
            </Text>
            <Button label="Open FamilyPilot" fullWidth onPress={() => router.replace('/' as never)} />
          </>
        ) : null}

        {view.kind === 'error' ? (
          <>
            <Text variant="heading1" accessibilityRole="header">
              Something went wrong
            </Text>
            <Text variant="body" color={colors.text.secondary}>
              {view.message}
            </Text>
            <Button label="Try again" fullWidth onPress={() => router.replace(`/invite/${code}` as never)} />
          </>
        ) : null}

        {ready ? (
          <>
            <Text variant="eyebrow">AN INVITATION</Text>
            <Text variant="heading1" accessibilityRole="header" testID="invite-headline">
              {ready.label} invited you to plan days out together
            </Text>
            <Text variant="body" color={colors.text.secondary}>
              Connect your families and a day can work around both: routines, drive times, who needs what.
            </Text>

            <View style={styles.terms}>
              <Text variant="heading3">If you accept, they will see</Text>
              {WHAT_IS_SHARED.map((line) => (
                <Text key={line} variant="bodySmall" color={colors.text.secondary}>
                  • {line}
                </Text>
              ))}
              <Text variant="caption" color={colors.text.tertiary}>
                They are shown only after you accept, and you can disconnect at any time. Opening this link shared nothing.
              </Text>
            </View>

            {signedIn && hasCompletedOnboarding ? (
              <Button label={busy ? 'Connecting…' : 'Accept and connect'} fullWidth disabled={busy} onPress={() => void accept()} testID="invite-accept" />
            ) : signedIn ? (
              <Button label="Describe your family to accept" fullWidth onPress={() => router.replace('/(onboarding)/setup' as never)} testID="invite-to-setup" />
            ) : (
              <>
                <Button label="Create an account to accept" fullWidth onPress={() => router.push('/(onboarding)/account' as never)} testID="invite-to-signup" />
                <Button
                  label="I already have an account"
                  variant="outline"
                  fullWidth
                  onPress={() => router.push({ pathname: '/(onboarding)/account', params: { mode: 'signin' } } as never)}
                />
              </>
            )}
            <Button
              label="Not now"
              variant="ghost"
              fullWidth
              onPress={() => {
                clearPending();
                router.replace('/' as never);
              }}
            />
          </>
        ) : null}

        {view.kind === 'accepted' ? (
          <>
            <Text variant="eyebrow">CONNECTED</Text>
            <Text variant="heading1" accessibilityRole="header" testID="invite-connected">
              You’re connected with {view.label}
            </Text>
            <Text variant="body" color={colors.text.secondary}>
              Add them to a plan from any place: choose Create a plan, then Add another family.
            </Text>
            <Button label="Go to Home" fullWidth onPress={() => router.replace('/(tabs)' as never)} testID="invite-done" />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.screenPadding, paddingVertical: spacing['2xl'], gap: spacing.lg },
  center: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing['3xl'] },
  terms: { gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderLight },
});
