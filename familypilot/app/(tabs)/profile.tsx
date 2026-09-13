import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { FadeInView } from '@/src/components/ui/FadeInView';
import { ScreenContainer } from '@/src/components/shared/ScreenContainer';
import { Button, Card, EmptyState, Skeleton, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { useFamilyProfile } from '@/src/hooks/use-queries';
import { formatBudgetTier, formatChildAge } from '@/src/utils/profile-defaults';
import { getProfileSuggestion } from '@/src/utils/profile-completion';
import { formatClock } from '@/src/utils/clock-format';
import { FacilityType } from '@/src/types';

const MUST_HAVE_LABELS: Partial<Record<FacilityType, string>> = {
  toilets: 'Toilets',
  baby_changing: 'Baby changing',
  parking: 'Parking',
  pushchair_friendly: 'Pushchair access',
};

function formatRoutineTime(time: string): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) return time;
  return formatClock(Number(match[1]) * 60 + Number(match[2]));
}

export default function ProfileScreen() {
  const router = useRouter();
  const { data: profile, isLoading } = useFamilyProfile();

  if (isLoading) {
    return (
      <ScreenContainer>
        <View style={styles.loading}>
          <Skeleton height={200} borderRadius={radius.lg} />
        </View>
      </ScreenContainer>
    );
  }

  if (!profile) {
    return (
      <ScreenContainer>
        <EmptyState
          icon="person-circle-outline"
          title="We couldn't load your family profile"
          message="Set up your family to get personalised recommendations."
          actionLabel="Set up your family"
          onAction={() => router.replace('/(onboarding)/setup' as never)}
        />
      </ScreenContainer>
    );
  }

  const children = profile.members.filter((m) => m.role === 'child');
  const suggestion = getProfileSuggestion(profile);

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text variant="heading1">Your family</Text>
        <Text variant="bodySmall" color={colors.text.secondary} style={styles.subtitle}>
          What FamilyPilot knows about the people you plan for
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <FadeInView>
          <Card style={styles.familyCard}>
            <View style={styles.avatarRow}>
              {profile.members.map((member, index) => (
                <LinearGradient
                  key={member.id}
                  colors={AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length]}
                  style={[styles.avatar, index > 0 && styles.avatarOverlap]}
                >
                  <Text variant="heading3" color={colors.text.inverse}>
                    {member.name.charAt(0)}
                  </Text>
                </LinearGradient>
              ))}
            </View>
            <Text variant="heading2" style={styles.familyName}>
              The {profile.parentName} Family
            </Text>
            {suggestion ? (
              <View style={styles.suggestionBox}>
                <Text variant="bodySmall" color={colors.text.secondary}>
                  Make recommendations even better
                </Text>
                <Text variant="body" style={styles.suggestionText}>
                  {suggestion.message}
                </Text>
              </View>
            ) : (
              <Text variant="bodySmall" color={colors.text.secondary} style={styles.allSet}>
                FamilyPilot has what it needs to personalise your recommendations.
              </Text>
            )}
            <Button
              label="Edit family details"
              variant="outline"
              fullWidth
              onPress={() => router.push('/profile/edit' as never)}
              style={styles.editButton}
            />
          </Card>
        </FadeInView>

        <Text variant="heading3" style={styles.sectionTitle}>
          Your children
        </Text>
        <Card style={styles.prefCard}>
          {children.map((child, index) => (
            <FadeInView key={child.id} delay={index * 50}>
              <ProfileRow
                icon="person-outline"
                label={child.name}
                value={formatChildAge(child)}
              />
            </FadeInView>
          ))}
        </Card>

        <Text variant="heading3" style={styles.sectionTitle}>
          Naps, feeds & must-haves
        </Text>
        <Card style={styles.prefCard}>
          {(profile.routines ?? []).length > 0 ? (
            (profile.routines ?? []).map((routine) => (
              <ProfileRow
                key={routine.id}
                icon={routine.kind === 'nap' ? 'moon-outline' : 'restaurant-outline'}
                label={routine.label?.trim() || (routine.kind === 'nap' ? 'Nap' : 'Feed')}
                value={formatRoutineTime(routine.time)}
              />
            ))
          ) : (
            <ProfileRow icon="moon-outline" label="Naps & feeds" value="Not set" />
          )}
          <ProfileRow
            icon="checkmark-done-outline"
            label="Must-haves"
            value={
              (profile.mustHaveFacilities ?? []).length > 0
                ? profile.mustHaveFacilities!.map((f) => MUST_HAVE_LABELS[f] ?? f).join(', ')
                : 'Not set'
            }
          />
        </Card>

        <Text variant="heading3" style={styles.sectionTitle}>
          Preferences
        </Text>
        <Card style={styles.prefCard}>
          <ProfileRow icon="location-outline" label="Home" value={profile.homeLocation || 'Not set'} />
          <ProfileRow
            icon="car-outline"
            label="Max drive"
            value={`${profile.maxDriveMinutes} minutes`}
          />
          <ProfileRow
            icon="wallet-outline"
            label="Budget"
            value={formatBudgetTier(profile.budgetTier)}
          />
        </Card>

        <Text variant="heading3" style={styles.sectionTitle}>
          Vehicle
        </Text>
        <Card style={styles.prefCard}>
          <ProfileRow
            icon="car-sport-outline"
            label="Car"
            value={profile.vehicle?.trim() || 'Not added'}
          />
        </Card>

        <Text variant="heading3" style={styles.sectionTitle}>
          Equipment
        </Text>
        <Card style={styles.prefCard}>
          <ProfileRow
            icon="bag-outline"
            label="Pushchair"
            value={profile.pushchair?.trim() || 'Not added'}
          />
          <ProfileRow
            icon="bed-outline"
            label="Travel cot"
            value={profile.travelCot?.trim() || 'Not added'}
          />
        </Card>

        <Text variant="heading3" style={styles.sectionTitle}>
          Memberships & discounts
        </Text>
        <Card style={styles.prefCard}>
          <ProfileRow
            icon="card-outline"
            label="Memberships"
            value={
              profile.memberships && profile.memberships.length > 0
                ? profile.memberships.join(', ')
                : 'Not linked'
            }
          />
        </Card>

        <Pressable
          style={styles.aboutRow}
          onPress={() => router.push('/about' as never)}
          accessibilityRole="button"
          accessibilityLabel="About FamilyPilot and data sources"
        >
          <Ionicons name="information-circle-outline" size={20} color={colors.text.secondary} />
          <Text variant="bodySmall" color={colors.text.secondary} style={styles.aboutText}>
            About FamilyPilot · Beta data & sources
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} />
        </Pressable>

        <Pressable
          style={styles.feedbackRow}
          onPress={() => router.push('/feedback' as never)}
          accessibilityRole="button"
          accessibilityLabel="Send feedback"
        >
          <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.primary[500]} />
          <Text variant="body" style={styles.feedbackText}>
            Send feedback
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} />
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}

function ProfileRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.prefRow}>
      <Ionicons name={icon} size={20} color={colors.text.secondary} />
      <Text variant="bodySmall" color={colors.text.secondary} style={styles.prefLabel}>
        {label}
      </Text>
      <Text variant="body" style={styles.prefValue}>
        {value}
      </Text>
    </View>
  );
}

const AVATAR_GRADIENTS: readonly [string, string][] = [
  [colors.primary[500], colors.primary[600]],
  [colors.secondary[500], colors.secondary[600]],
  [colors.accent[500], colors.accent[600]],
  [colors.coral, '#C0472F'],
];

const styles = StyleSheet.create({
  loading: {
    padding: spacing.screenPadding,
  },
  header: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.lg,
  },
  subtitle: {
    marginTop: spacing.xs,
  },
  content: {
    padding: spacing.screenPadding,
    paddingBottom: spacing['3xl'],
  },
  familyCard: {
    alignItems: 'center',
    marginBottom: spacing['2xl'],
  },
  avatarRow: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.surface,
  },
  avatarOverlap: {
    marginLeft: -12,
  },
  familyName: {
    marginBottom: spacing.lg,
  },
  suggestionBox: {
    width: '100%',
    backgroundColor: colors.primary[50],
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  suggestionText: {
    color: colors.text.primary,
    lineHeight: 22,
  },
  allSet: {
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  editButton: {
    marginTop: spacing.sm,
  },
  sectionTitle: {
    marginBottom: spacing.lg,
    marginTop: spacing.lg,
  },
  prefCard: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  prefLabel: {
    width: 100,
    marginLeft: spacing.md,
  },
  prefValue: {
    flex: 1,
    textAlign: 'right',
    marginRight: spacing.sm,
  },
  aboutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingVertical: spacing.md,
    gap: spacing.md,
    marginTop: spacing['2xl'],
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  aboutText: {
    flex: 1,
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingVertical: spacing.md,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  feedbackText: {
    flex: 1,
  },
});
