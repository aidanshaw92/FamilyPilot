import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { FadeInView } from '@/src/components/ui/FadeInView';
import { ScreenContainer } from '@/src/components/shared/ScreenContainer';
import { Button, Card, Skeleton, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { useFamilyProfile } from '@/src/hooks/use-queries';
import { formatBudgetTier, formatChildAge } from '@/src/utils/profile-defaults';
import { getNextCompletionHint } from '@/src/utils/profile-completion';

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

  if (!profile) return null;

  const children = profile.members.filter((m) => m.role === 'child');
  const completionHint = getNextCompletionHint(profile);

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text variant="heading1">Your family</Text>
        <Text variant="bodySmall" color={colors.text.secondary} style={styles.subtitle}>
          The more we know, the better we recommend
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <FadeInView>
          <Card style={styles.familyCard}>
            <View style={styles.avatarRow}>
              {profile.members.map((member, index) => (
                <View
                  key={member.id}
                  style={[
                    styles.avatar,
                    { backgroundColor: AVATAR_COLORS[index % AVATAR_COLORS.length] },
                    index > 0 && styles.avatarOverlap,
                  ]}
                >
                  <Text variant="heading3" color={colors.text.inverse}>
                    {member.name.charAt(0)}
                  </Text>
                </View>
              ))}
            </View>
            <Text variant="heading2" style={styles.familyName}>
              The {profile.parentName} Family
            </Text>
            <View style={styles.completionRow}>
              <View style={styles.progressBar}>
                <View
                  style={[styles.progressFill, { width: `${profile.completionPercent}%` }]}
                />
              </View>
              <Text variant="caption" color={colors.text.secondary}>
                {profile.completionPercent}% complete
                {completionHint ? ` — ${completionHint.label}` : ' — looking good!'}
              </Text>
            </View>
            <Button
              label="Edit profile"
              variant="outline"
              fullWidth
              onPress={() => router.push('/profile/edit' as never)}
              style={styles.editButton}
            />
          </Card>
        </FadeInView>

        <Text variant="heading3" style={styles.sectionTitle}>
          Children
        </Text>
        {children.map((child, index) => (
          <FadeInView key={child.id} delay={index * 50}>
            <ProfileRow
              icon="person-outline"
              label={child.name}
              value={formatChildAge(child.age)}
            />
          </FadeInView>
        ))}

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
        <ProfileRow
          icon="car-sport-outline"
          label="Car"
          value={profile.vehicle?.trim() || 'Not added'}
        />

        <Text variant="heading3" style={styles.sectionTitle}>
          Equipment
        </Text>
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

        <Text variant="heading3" style={styles.sectionTitle}>
          Memberships & discounts
        </Text>
        <ProfileRow
          icon="card-outline"
          label="Memberships"
          value={
            profile.memberships && profile.memberships.length > 0
              ? profile.memberships.join(', ')
              : 'Not linked'
          }
        />

        <View style={styles.testingNotice}>
          <Text variant="caption" color={colors.text.secondary}>
            FamilyPilot is currently an early testing version. Some venues, prices and availability
            information are prototype data.
          </Text>
        </View>

        <Text variant="heading3" style={styles.sectionTitle}>
          Testing
        </Text>
        <Pressable
          style={styles.feedbackRow}
          onPress={() => router.push('/feedback' as never)}
          accessibilityRole="button"
          accessibilityLabel="Send tester feedback"
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

const AVATAR_COLORS = [
  colors.primary[500],
  colors.secondary[500],
  colors.accent[500],
  colors.coral,
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
  completionRow: {
    width: '100%',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  progressBar: {
    width: '100%',
    height: 6,
    backgroundColor: colors.borderLight,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.secondary[500],
    borderRadius: radius.full,
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
  testingNotice: {
    marginTop: spacing['2xl'],
    padding: spacing.lg,
    backgroundColor: colors.borderLight,
    borderRadius: radius.md,
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
