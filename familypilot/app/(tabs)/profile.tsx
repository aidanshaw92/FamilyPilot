import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { FadeInView } from '@/src/components/ui/FadeInView';
import { ScreenContainer } from '@/src/components/shared/ScreenContainer';
import { Card, Skeleton, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { useFamilyProfile } from '@/src/hooks/use-queries';

export default function ProfileScreen() {
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
                {profile.completionPercent}% complete — add your car to unlock Car Fit
              </Text>
            </View>
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
              value={`${child.age} years old`}
            />
          </FadeInView>
        ))}

        <Text variant="heading3" style={styles.sectionTitle}>
          Preferences
        </Text>
        <Card style={styles.prefCard}>
          <ProfileRow icon="location-outline" label="Home" value={profile.homeLocation} editable />
          <ProfileRow
            icon="car-outline"
            label="Max drive"
            value={`${profile.maxDriveMinutes} minutes`}
            editable
          />
          <ProfileRow
            icon="wallet-outline"
            label="Budget"
            value={profile.budgetTier.charAt(0).toUpperCase() + profile.budgetTier.slice(1)}
            editable
          />
        </Card>

        <Text variant="heading3" style={styles.sectionTitle}>
          Vehicle
        </Text>
        <ProfileRow icon="car-sport-outline" label="Car" value="Tesla Model Y" editable />

        <Text variant="heading3" style={styles.sectionTitle}>
          Equipment
        </Text>
        <ProfileRow icon="bag-outline" label="Pushchair" value="Bugaboo Butterfly" editable />
        <ProfileRow icon="bed-outline" label="Travel cot" value="Not added" editable />

        <Text variant="heading3" style={styles.sectionTitle}>
          Memberships & discounts
        </Text>
        <ProfileRow icon="card-outline" label="National Trust" value="Not linked" editable />
      </ScrollView>
    </ScreenContainer>
  );
}

function ProfileRow({
  icon,
  label,
  value,
  editable = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  editable?: boolean;
}) {
  return (
    <Pressable
      style={styles.prefRow}
      accessibilityRole={editable ? 'button' : 'text'}
      accessibilityLabel={editable ? `Edit ${label}` : undefined}
    >
      <Ionicons name={icon} size={20} color={colors.text.secondary} />
      <Text variant="bodySmall" color={colors.text.secondary} style={styles.prefLabel}>
        {label}
      </Text>
      <Text variant="body" style={styles.prefValue}>
        {value}
      </Text>
      {editable ? (
        <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} />
      ) : null}
    </Pressable>
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
});
