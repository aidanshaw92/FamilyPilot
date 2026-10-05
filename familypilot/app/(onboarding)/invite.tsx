import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InviteLinkCard } from '@/src/components/planning/InviteLinkCard';
import { Button, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { InviteError, createInvite } from '@/src/services/planning/connection-invites';
import { InviteRelationship } from '@/src/services/planning/invite-links';
import { useFamilyStore } from '@/src/stores/family-store';
import { useFamilyProfile } from '@/src/hooks/use-queries';

/**
 * The last, optional step of getting started: "Who do you plan days out with?"
 *
 * Three ways to invite (a partner, family or friends, or just a link to send anywhere) and a plain "Do this later". It
 * is deliberately not a form: nothing here is required, nobody is asked for an email address or a phone number, and
 * leaving costs nothing because the same invitations are in Plans whenever they are wanted. Each invitation is a single
 * use, seven day link; what accepting shares is stated on the link card and in the invitee's own consent screen.
 */
const OPTIONS: Array<{ id: InviteRelationship; title: string; body: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { id: 'partner', title: 'Invite your partner', body: 'So days out work for both of you.', icon: 'heart-outline' },
  { id: 'family', title: 'Invite family or friends', body: 'Grandparents, cousins, the other parents you meet up with.', icon: 'people-outline' },
  { id: 'friend', title: 'Share an invite link', body: 'Send it however you like. It works once.', icon: 'link-outline' },
];

export default function InviteStepScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: profile } = useFamilyProfile();
  const stored = useFamilyStore((s) => s.profile);
  const [busy, setBusy] = useState<InviteRelationship | null>(null);
  const [invites, setInvites] = useState<Array<{ id: string; relationship: InviteRelationship; url: string }>>([]);
  const [error, setError] = useState('');
  const first = (profile ?? stored)?.parentName?.trim().split(/\s+/)[0];

  const create = async (relationship: InviteRelationship) => {
    if (busy) return;
    setError('');
    setBusy(relationship);
    try {
      const invite = await createInvite(profile ?? stored, relationship);
      setInvites((current) => [{ id: invite.id, relationship, url: invite.url }, ...current]);
    } catch (e) {
      setError(e instanceof InviteError || e instanceof Error ? e.message : 'Could not create the invitation. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const finish = () => router.replace('/(tabs)' as never);

  return (
    <View style={[styles.flex, { paddingTop: insets.top, paddingBottom: insets.bottom }]} testID="invite-step">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text variant="eyebrow">LAST STEP · OPTIONAL</Text>
        <Text variant="heading1" accessibilityRole="header" style={styles.heading}>
          Who do you plan days out with?
        </Text>
        <Text variant="body" color={colors.text.secondary} style={styles.sub}>
          Connect another family or person and a day can work around everyone: routines, drive times, who needs what. You
          can do this any time from Plans.
        </Text>

        <View style={styles.options}>
          {OPTIONS.map((option) => (
            <Pressable
              key={option.id}
              onPress={() => void create(option.id)}
              disabled={busy !== null}
              accessibilityRole="button"
              accessibilityLabel={option.title}
              style={({ pressed }) => [styles.option, pressed && styles.pressed]}
              testID={`invite-option-${option.id}`}
            >
              <View style={styles.optionIcon}>
                <Ionicons name={option.icon} size={22} color={colors.action} />
              </View>
              <View style={styles.optionText}>
                <Text variant="heading3">{busy === option.id ? 'Creating link…' : option.title}</Text>
                <Text variant="bodySmall" color={colors.text.secondary}>
                  {option.body}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
            </Pressable>
          ))}
        </View>

        {error ? (
          <Text accessibilityRole="alert" color={colors.error[600]}>
            {error}
          </Text>
        ) : null}

        {invites.map((invite) => (
          <InviteLinkCard key={invite.id} url={invite.url} relationship={invite.relationship} inviterFirstName={first} />
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={invites.length > 0 ? 'Done, take me to Home' : 'Do this later'}
          variant={invites.length > 0 ? 'primary' : 'outline'}
          fullWidth
          onPress={finish}
          testID="invite-finish"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.screenPadding, paddingTop: spacing['2xl'], paddingBottom: spacing['3xl'], gap: spacing.md },
  heading: { color: colors.ink },
  sub: { lineHeight: 24 },
  options: { gap: spacing.md, marginTop: spacing.md },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    minHeight: 76,
  },
  pressed: { opacity: 0.85 },
  optionIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.actionSoft, alignItems: 'center', justifyContent: 'center' },
  optionText: { flex: 1, gap: 2 },
  footer: { paddingHorizontal: spacing.screenPadding, paddingTop: spacing.md, paddingBottom: spacing.md },
});
