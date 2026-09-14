import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, CircleButton, EmptyState, Skeleton, Text } from '@/src/components/ui';
import { colors, layout, radius, shadows, spacing } from '@/src/design-system/tokens';
import { useFamilyProfile } from '@/src/hooks/use-queries';
import { FacilityType, FamilyMember } from '@/src/types';
import { formatClock } from '@/src/utils/clock-format';
import { getProfileSuggestion } from '@/src/utils/profile-completion';
import { formatBudgetTier, formatChildAge } from '@/src/utils/profile-defaults';

const MUST_HAVE_LABELS: Partial<Record<FacilityType, string>> = {
  toilets: 'Toilets',
  baby_changing: 'Baby changing',
  parking: 'Parking',
  pushchair_friendly: 'Pushchair access',
};

const AVATAR_GRADIENTS: readonly [string, string][] = [
  [colors.primary[500], colors.primary[600]],
  [colors.secondary[500], colors.secondary[600]],
  [colors.accent[500], colors.accent[600]],
  [colors.coral, '#C0472F'],
];

function formatRoutineTime(time: string): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) return time;
  return formatClock(Number(match[1]) * 60 + Number(match[2]));
}

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: profile, isLoading } = useFamilyProfile();

  if (isLoading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.xl }]}>
        <View style={styles.gutter}>
          <Skeleton height={180} borderRadius={radius['3xl']} style={styles.skeleton} />
          <Skeleton height={140} borderRadius={radius['2xl']} style={styles.skeleton} />
          <Skeleton height={140} borderRadius={radius['2xl']} />
        </View>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing['3xl'] }]}>
        <View style={styles.gutter}>
          <EmptyState
            icon="person-circle-outline"
            title="We couldn't load your family profile"
            message="Set up your family to get personalised recommendations."
            actionLabel="Set up your family"
            onAction={() => router.replace('/(onboarding)/setup' as never)}
          />
        </View>
      </View>
    );
  }

  const children = profile.members.filter((member) => member.role === 'child');
  const grownUps = profile.members.filter((member) => member.role !== 'child');
  const routines = profile.routines ?? [];
  const mustHaves = profile.mustHaveFacilities ?? [];
  const suggestion = getProfileSuggestion(profile);

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
      >
        <View style={[styles.gutter, styles.topRow]}>
          <View style={styles.topText}>
            <Text variant="caption" color={colors.text.tertiary}>
              YOUR PROFILE
            </Text>
            <Text variant="display" style={styles.title}>
              The {profile.parentName} family
            </Text>
          </View>
          <CircleButton
            icon="create-outline"
            tone="dark"
            accessibilityLabel="Edit family details"
            onPress={() => router.push('/profile/edit' as never)}
          />
        </View>

        {/* Who we plan for. Avatars first so the screen reads as people, not settings. */}
        <View style={styles.gutter}>
          <View style={styles.peopleCard}>
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
            <Text variant="bodySmall" color={colors.text.secondary} style={styles.peopleSummary}>
              {describeHousehold(children, grownUps)}
            </Text>

            {children.length > 0 ? (
              <View style={styles.childList}>
                {children.map((child) => (
                  <View key={child.id} style={styles.childRow}>
                    <Text variant="body" style={styles.childName}>
                      {child.name}
                    </Text>
                    <Text variant="bodySmall" color={colors.text.secondary}>
                      {formatChildAge(child)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {suggestion ? (
              <View style={styles.suggestion}>
                <Ionicons name="sparkles-outline" size={18} color={colors.text.primary} />
                <Text variant="bodySmall" style={styles.suggestionText}>
                  {suggestion.message}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Naps and feeds drive every timing the app suggests, so they get their own block. */}
        <Section title="Naps & feeds" hint="We build plans around these times">
          {routines.length > 0 ? (
            <View style={styles.tileWrap}>
              {routines.map((routine) => (
                <View key={routine.id} style={styles.timeTile}>
                  <Ionicons
                    name={routine.kind === 'nap' ? 'moon-outline' : 'restaurant-outline'}
                    size={18}
                    color={colors.text.secondary}
                  />
                  <Text variant="heading3" style={styles.timeValue}>
                    {formatRoutineTime(routine.time)}
                  </Text>
                  <Text variant="caption" color={colors.text.secondary}>
                    {routine.label?.trim() || (routine.kind === 'nap' ? 'Nap' : 'Feed')}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <NotSet
              message="No naps or feeds added yet. Add them and every plan will work around them."
              actionLabel="Add routines"
              onPress={() => router.push('/profile/edit' as never)}
            />
          )}
        </Section>

        <Section title="Must-haves" hint="Places without these are ruled out">
          {mustHaves.length > 0 ? (
            <View style={styles.chipWrap}>
              {mustHaves.map((facility) => (
                <View key={facility} style={styles.chip}>
                  <Ionicons name="checkmark" size={14} color={colors.text.primary} />
                  <Text variant="bodySmall">{MUST_HAVE_LABELS[facility] ?? facility}</Text>
                </View>
              ))}
            </View>
          ) : (
            <NotSet
              message="Nothing set. Pick the facilities your day depends on."
              actionLabel="Choose must-haves"
              onPress={() => router.push('/profile/edit' as never)}
            />
          )}
        </Section>

        <Section title="Getting there">
          <View style={styles.detailCard}>
            <DetailRow icon="location-outline" label="Home" value={profile.homeLocation || null} />
            <DetailRow
              icon="car-outline"
              label="Max drive"
              value={`${profile.maxDriveMinutes} minutes`}
            />
            <DetailRow
              icon="wallet-outline"
              label="Budget"
              value={formatBudgetTier(profile.budgetTier)}
            />
            <DetailRow
              icon="car-sport-outline"
              label="Car"
              value={profile.vehicle?.trim() || null}
              last
            />
          </View>
        </Section>

        <Section title="Kit & memberships">
          <View style={styles.detailCard}>
            <DetailRow icon="bag-outline" label="Pushchair" value={profile.pushchair?.trim() || null} />
            <DetailRow icon="bed-outline" label="Travel cot" value={profile.travelCot?.trim() || null} />
            <DetailRow
              icon="card-outline"
              label="Memberships"
              value={profile.memberships?.length ? profile.memberships.join(', ') : null}
              last
            />
          </View>
        </Section>

        <View style={styles.gutter}>
          <View style={styles.linkCard}>
            <LinkRow
              icon="people-outline"
              label="Families you plan with"
              onPress={() => router.push('/(tabs)/families' as never)}
            />
            <LinkRow
              icon="chatbubble-ellipses-outline"
              label="Send feedback"
              onPress={() => router.push('/feedback' as never)}
            />
            <LinkRow
              icon="information-circle-outline"
              label="About FamilyPilot & data sources"
              onPress={() => router.push('/about' as never)}
              last
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/** Plain-language household summary, built only from members that actually exist. */
function describeHousehold(children: FamilyMember[], grownUps: FamilyMember[]): string {
  const parts: string[] = [];
  if (grownUps.length) {
    parts.push(`${grownUps.length} grown-up${grownUps.length === 1 ? '' : 's'}`);
  }
  if (children.length) {
    parts.push(`${children.length} child${children.length === 1 ? '' : 'ren'}`);
  }
  return parts.length ? parts.join(' and ') : 'Add the people you plan for';
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.gutter, styles.section]}>
      <Text variant="heading3">{title}</Text>
      {hint ? (
        <Text variant="caption" color={colors.text.tertiary} style={styles.hint}>
          {hint}
        </Text>
      ) : null}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

/** A fact row that never invents a value: an unset field says so and offers the way to set it. */
function DetailRow({
  icon,
  label,
  value,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | null;
  last?: boolean;
}) {
  return (
    <View style={[styles.detailRow, last && styles.detailRowLast]}>
      <Ionicons name={icon} size={19} color={colors.text.secondary} />
      <Text variant="bodySmall" color={colors.text.secondary} style={styles.detailLabel}>
        {label}
      </Text>
      <Text
        variant="body"
        color={value ? colors.text.primary : colors.text.tertiary}
        style={styles.detailValue}
        numberOfLines={2}
      >
        {value ?? 'Not added'}
      </Text>
    </View>
  );
}

function NotSet({
  message,
  actionLabel,
  onPress,
}: {
  message: string;
  actionLabel: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.notSet}>
      <Text variant="bodySmall" color={colors.text.secondary}>
        {message}
      </Text>
      <Button label={actionLabel} variant="secondary" onPress={onPress} style={styles.notSetButton} />
    </View>
  );
}

function LinkRow({
  icon,
  label,
  onPress,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.linkRow, last && styles.detailRowLast, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={19} color={colors.text.secondary} />
      <Text variant="body" style={styles.linkLabel}>
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: layout.navClearance,
  },
  gutter: {
    paddingHorizontal: spacing.screenPadding,
  },
  skeleton: {
    marginBottom: spacing.lg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  topText: {
    flex: 1,
  },
  title: {
    marginTop: 4,
  },
  peopleCard: {
    backgroundColor: colors.surface,
    borderRadius: radius['3xl'],
    padding: spacing.xl,
    ...shadows.card,
  },
  avatarRow: {
    flexDirection: 'row',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.surface,
  },
  avatarOverlap: {
    marginLeft: -14,
  },
  peopleSummary: {
    marginTop: spacing.lg,
  },
  childList: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  childName: {
    flex: 1,
    marginRight: spacing.md,
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  suggestionText: {
    flex: 1,
  },
  section: {
    marginTop: spacing['2xl'],
  },
  hint: {
    marginTop: 2,
  },
  sectionBody: {
    marginTop: spacing.lg,
  },
  tileWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  timeTile: {
    minWidth: 104,
    backgroundColor: colors.surface,
    borderRadius: radius['2xl'],
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    gap: 4,
    ...shadows.card,
  },
  timeValue: {
    marginTop: 2,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    ...shadows.card,
  },
  detailCard: {
    backgroundColor: colors.surface,
    borderRadius: radius['2xl'],
    paddingHorizontal: spacing.lg,
    ...shadows.card,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  detailRowLast: {
    borderBottomWidth: 0,
  },
  detailLabel: {
    width: 104,
    marginLeft: spacing.md,
  },
  detailValue: {
    flex: 1,
    textAlign: 'right',
  },
  notSet: {
    backgroundColor: colors.surface,
    borderRadius: radius['2xl'],
    padding: spacing.lg,
    gap: spacing.md,
    alignItems: 'flex-start',
    ...shadows.card,
  },
  notSetButton: {
    alignSelf: 'flex-start',
  },
  linkCard: {
    backgroundColor: colors.surface,
    borderRadius: radius['2xl'],
    paddingHorizontal: spacing.lg,
    marginTop: spacing['2xl'],
    ...shadows.card,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: spacing.md,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  linkLabel: {
    flex: 1,
  },
  pressed: {
    opacity: 0.6,
  },
});
