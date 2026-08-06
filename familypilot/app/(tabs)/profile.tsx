import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ScreenContainer } from '@/src/components/shared/ScreenContainer';
import { Card, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { useFamilyProfile } from '@/src/hooks/use-queries';

export default function ProfileScreen() {
  const { data: profile } = useFamilyProfile();

  if (!profile) return null;

  const children = profile.members.filter((m) => m.role === 'child');

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text variant="heading1">Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
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
                style={[
                  styles.progressFill,
                  { width: `${profile.completionPercent}%` },
                ]}
              />
            </View>
            <Text variant="caption">{profile.completionPercent}% complete</Text>
          </View>
        </Card>

        <Text variant="heading3" style={styles.sectionTitle}>
          Children
        </Text>
        {children.map((child) => (
          <Card key={child.id} style={styles.memberCard}>
            <View style={styles.memberRow}>
              <View style={[styles.memberAvatar, { backgroundColor: colors.accent[100] }]}>
                <Text variant="heading3" color={colors.accent[600]}>
                  {child.name.charAt(0)}
                </Text>
              </View>
              <View>
                <Text variant="heading3">{child.name}</Text>
                <Text variant="bodySmall">{child.age} years old</Text>
              </View>
            </View>
          </Card>
        ))}

        <Text variant="heading3" style={styles.sectionTitle}>
          Preferences
        </Text>
        <Card style={styles.prefCard}>
          <ProfileRow icon="location-outline" label="Home" value={profile.homeLocation} />
          <ProfileRow
            icon="car-outline"
            label="Max drive"
            value={`${profile.maxDriveMinutes} minutes`}
          />
          <ProfileRow
            icon="wallet-outline"
            label="Budget"
            value={profile.budgetTier.charAt(0).toUpperCase() + profile.budgetTier.slice(1)}
          />
        </Card>
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
      <Ionicons name={icon} size={20} color={colors.text.tertiary} />
      <Text variant="bodySmall" style={styles.prefLabel}>
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
  header: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.lg,
  },
  content: {
    padding: spacing.screenPadding,
    paddingBottom: spacing['5xl'],
  },
  familyCard: {
    alignItems: 'center',
    marginBottom: spacing['3xl'],
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
  },
  memberCard: {
    marginBottom: spacing.md,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prefCard: {
    gap: spacing.lg,
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  prefLabel: {
    width: 80,
    marginLeft: spacing.md,
  },
  prefValue: {
    flex: 1,
    textAlign: 'right',
  },
});
