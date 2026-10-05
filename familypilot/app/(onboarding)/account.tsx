import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '@/src/components/ui/BrandMark';
import { Button, Field, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { createAccount, requestPasswordReset, resendVerification, signIn } from '@/src/services/account/auth-service';
import {
  AUTH_FAILURE_COPY,
  emailProblem,
  maskEmail,
  passwordProblem,
} from '@/src/services/account/credentials';
import { useAuthStore } from '@/src/stores/auth-store';
import { useFamilyStore } from '@/src/stores/family-store';

/**
 * Create an account, verify the email, or sign in: the step between Welcome and describing the family.
 *
 * Every FamilyPilot user has an account, so this is not skippable. It asks for an email and a password and nothing
 * else: the family's details stay on the device and are collected on the next screens. If the project requires the
 * email to be confirmed (the recommended setting), creating the account ends in a "Check your email" state with a
 * resend and an "I've verified" button; following the link in the same browser signs the person in by itself.
 */
type Mode = 'create' | 'signin' | 'verify' | 'forgot';
const RESEND_COOLDOWN_S = 30;

export default function AccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ mode?: string }>();
  const status = useAuthStore((s) => s.status);
  const hasCompletedOnboarding = useFamilyStore((s) => s.hasCompletedOnboarding);

  const [mode, setMode] = useState<Mode>(params.mode === 'signin' ? 'signin' : 'create');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [cooldown, setCooldown] = useState(0);
  // The password is kept only in this screen's memory, for the "I've verified" check, and never stored.
  const typedPassword = useRef('');

  const proceed = useCallback(() => {
    router.replace((hasCompletedOnboarding ? '/' : '/(onboarding)/setup') as never);
  }, [router, hasCompletedOnboarding]);

  // The verification link, followed in this browser, signs the person in without a button press.
  useEffect(() => {
    if (status === 'signed_in') proceed();
  }, [status, proceed]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const validate = (needPassword: boolean): boolean => {
    const problem = emailProblem(email) ?? (needPassword ? passwordProblem(password) : null);
    setError(problem ?? '');
    return !problem;
  };

  const submitCreate = async () => {
    setInfo('');
    if (!validate(true) || busy) return;
    setBusy(true);
    typedPassword.current = password;
    const result = await createAccount(email, password);
    setBusy(false);
    if (result.status === 'signed_in') return proceed();
    if (result.status === 'needs_verification') {
      setPassword('');
      setMode('verify');
      setCooldown(RESEND_COOLDOWN_S);
      return;
    }
    if (result.failure === 'already-registered') {
      setMode('signin');
      setError('');
      setInfo('There’s already an account with that email. Enter your password to sign in.');
      return;
    }
    setError(result.message && result.failure === 'other' ? result.message : AUTH_FAILURE_COPY[result.failure]);
  };

  const submitSignIn = async () => {
    setInfo('');
    if (!validate(true) || busy) return;
    setBusy(true);
    typedPassword.current = password;
    const result = await signIn(email, password);
    setBusy(false);
    if (result.status === 'signed_in') return proceed();
    if (result.failure === 'email-not-confirmed') {
      setMode('verify');
      setPassword('');
      setCooldown(RESEND_COOLDOWN_S);
      return;
    }
    setError(AUTH_FAILURE_COPY[result.failure]);
  };

  const checkVerified = async () => {
    if (busy) return;
    setError('');
    setInfo('');
    setBusy(true);
    const result = await signIn(email, typedPassword.current);
    setBusy(false);
    if (result.status === 'signed_in') return proceed();
    setError(result.failure === 'email-not-confirmed' ? 'Not verified yet. Open the link in the email we sent, then tap this again.' : AUTH_FAILURE_COPY[result.failure]);
  };

  const resend = async () => {
    if (cooldown > 0 || busy) return;
    setError('');
    setBusy(true);
    const result = await resendVerification(email);
    setBusy(false);
    if (result.ok) {
      setInfo('We sent it again. Check your inbox and spam folder.');
      setCooldown(RESEND_COOLDOWN_S);
    } else {
      setError(AUTH_FAILURE_COPY[result.failure ?? 'other']);
    }
  };

  const submitForgot = async () => {
    setInfo('');
    const problem = emailProblem(email);
    setError(problem ?? '');
    if (problem || busy) return;
    setBusy(true);
    const result = await requestPasswordReset(email);
    setBusy(false);
    if (result.ok) setInfo('If there is an account for that email, we have sent a link to reset the password.');
    else setError(AUTH_FAILURE_COPY[result.failure ?? 'other']);
  };

  const heading =
    mode === 'verify' ? 'Check your email' : mode === 'signin' ? 'Welcome back' : mode === 'forgot' ? 'Reset your password' : 'Create your account';
  const sub =
    mode === 'verify'
      ? `We sent a link to ${maskEmail(email)}. Open it to verify your address, then come back here.`
      : mode === 'signin'
        ? 'Sign in to pick up where you left off.'
        : mode === 'forgot'
          ? 'Enter your email and we will send you a link.'
          : 'So your plans, saved places and connections are yours. It takes a minute.';

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        testID="account-screen"
      >
        <View style={styles.top}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(onboarding)/welcome' as never))}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={10}
            style={styles.back}
          >
            <Text variant="link">Back</Text>
          </Pressable>
          <BrandMark tone="light" size={36} />
        </View>

        <Text variant="heading1" accessibilityRole="header" style={styles.heading}>
          {heading}
        </Text>
        <Text variant="body" color={colors.text.secondary} style={styles.sub}>
          {sub}
        </Text>

        {mode === 'verify' ? (
          <View style={styles.form}>
            <View style={styles.verifyBox}>
              <Text variant="bodySmall" color={colors.text.secondary}>
                The link works once. If you can’t see the email, check your spam folder, or send it again.
              </Text>
            </View>
            <Button label="I’ve verified my email" fullWidth disabled={busy} onPress={() => void checkVerified()} testID="account-verified" />
            <Button
              label={cooldown > 0 ? `Send it again (${cooldown}s)` : 'Send it again'}
              variant="outline"
              fullWidth
              disabled={busy || cooldown > 0}
              onPress={() => void resend()}
              testID="account-resend"
            />
            <Button
              label="Use a different email"
              variant="ghost"
              fullWidth
              onPress={() => {
                setMode('create');
                setError('');
                setInfo('');
              }}
            />
          </View>
        ) : (
          <View style={styles.form}>
            <Field
              label="Email"
              value={email}
              onChange={setEmail}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              placeholder="you@example.com"
              testID="account-email"
            />
            {mode !== 'forgot' ? (
              <Field
                label={mode === 'create' ? 'Choose a password' : 'Password'}
                value={password}
                onChange={setPassword}
                secure
                autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
                textContentType={mode === 'create' ? 'newPassword' : 'password'}
                onSubmit={() => void (mode === 'create' ? submitCreate() : submitSignIn())}
                testID="account-password"
              />
            ) : null}
            {mode === 'create' ? (
              <Text variant="caption" color={colors.text.tertiary}>
                At least 10 characters.
              </Text>
            ) : null}

            {mode === 'create' ? (
              <Button label={busy ? 'Creating…' : 'Create account'} fullWidth disabled={busy} onPress={() => void submitCreate()} testID="account-create" />
            ) : mode === 'signin' ? (
              <Button label={busy ? 'Signing in…' : 'Sign in'} fullWidth disabled={busy} onPress={() => void submitSignIn()} testID="account-signin" />
            ) : (
              <Button label={busy ? 'Sending…' : 'Send reset link'} fullWidth disabled={busy} onPress={() => void submitForgot()} />
            )}

            <View style={styles.switchRow}>
              {mode === 'create' ? (
                <Button label="I already have an account" variant="ghost" onPress={() => { setMode('signin'); setError(''); setInfo(''); }} testID="account-to-signin" />
              ) : (
                <Button label="Create a new account" variant="ghost" onPress={() => { setMode('create'); setError(''); setInfo(''); }} />
              )}
              {mode === 'signin' ? (
                <Button label="Forgot password?" variant="ghost" onPress={() => { setMode('forgot'); setError(''); setInfo(''); }} />
              ) : null}
            </View>
          </View>
        )}

        {error ? (
          <Text accessibilityRole="alert" color={colors.error[600]} style={styles.message} testID="account-error">
            {error}
          </Text>
        ) : null}
        {info ? (
          <Text accessibilityRole="alert" color={colors.secondary[600]} style={styles.message} testID="account-info">
            {info}
          </Text>
        ) : null}

        <Text variant="caption" color={colors.text.tertiary} style={styles.privacy}>
          We use your email only to verify it is you and to keep your connections safe. Your family’s details stay on
          this device.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.screenPadding, paddingBottom: spacing['3xl'], gap: spacing.md },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56 },
  back: { minHeight: 44, justifyContent: 'center' },
  heading: { marginTop: spacing.lg, color: colors.ink },
  sub: { lineHeight: 24 },
  form: { gap: spacing.md, marginTop: spacing.lg },
  verifyBox: { backgroundColor: colors.fill, borderRadius: radius.lg, padding: spacing.lg },
  switchRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' },
  message: { marginTop: spacing.sm },
  privacy: { marginTop: spacing.lg },
});
