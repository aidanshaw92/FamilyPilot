import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TextField } from '@/src/components/profile/TextField';
import { Button, Chip, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { supabase } from '@/src/services/supabase/client';

export default function AccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmSent, setConfirmSent] = useState(false);

  const continueOnboarding = () => router.push('/(onboarding)/setup' as never);

  useEffect(() => {
    // Account creation isn't configured for this build: don't block onboarding on a
    // feature that can't work, just continue straight to setting up the family.
    if (!supabase) continueOnboarding();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!supabase) return null;

  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (mode === 'signup') {
        if (password.length < 10) throw new Error('Use a password with at least 10 characters.');
        const { data, error: signUpError } = await supabase!.auth.signUp({
          email: email.trim(),
          password,
        });
        if (signUpError) throw signUpError;
        if (data.session) {
          continueOnboarding();
        } else {
          setConfirmSent(true);
        }
      } else {
        const { error: signInError } = await supabase!.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
        continueOnboarding();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.iconWrap}>
          <Ionicons name="person-circle-outline" size={40} color={colors.text.inverse} />
        </View>
        <Text variant="heading1" style={styles.heading}>
          Create your account
        </Text>
        <Text variant="body" color={colors.text.secondary} style={styles.subtitle}>
          Your account saves your family and lets you connect with friends to plan days out
          together. You can add friends once you’re set up.
        </Text>

        {confirmSent ? (
          <View style={styles.confirmBox}>
            <Text variant="heading3">Check your email</Text>
            <Text color={colors.text.secondary} style={styles.confirmText}>
              We’ve sent a confirmation link to {email.trim()}. You can confirm it later, your
              family setup continues now.
            </Text>
            <Button label="Continue" size="lg" fullWidth onPress={continueOnboarding} />
          </View>
        ) : (
          <>
            <View style={styles.modeRow}>
              <Chip label="Create account" active={mode === 'signup'} onPress={() => setMode('signup')} />
              <Chip label="Sign in" active={mode === 'signin'} onPress={() => setMode('signin')} />
            </View>

            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            <TextField
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder={mode === 'signup' ? 'At least 10 characters' : 'Your password'}
              secureTextEntry
              autoComplete="password"
              error={error || undefined}
            />

            <Button
              label={busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
              size="lg"
              fullWidth
              disabled={busy}
              onPress={() => void handleSubmit()}
              style={styles.submit}
            />
          </>
        )}
      </ScrollView>

      {!confirmSent ? (
        <View style={styles.footer}>
          <Button label="Skip for now" variant="ghost" fullWidth onPress={continueOnboarding} />
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.screenPadding,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    backgroundColor: colors.primary[500],
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.xl,
  },
  heading: {
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: spacing['2xl'],
  },
  modeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  submit: {
    marginTop: spacing.sm,
  },
  confirmBox: {
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  confirmText: {
    lineHeight: 22,
  },
  footer: {
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
});
