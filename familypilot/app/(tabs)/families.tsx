import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FamilyEditor } from '@/src/components/planning/FamilyEditor';
import { PlanningAccount } from '@/src/components/planning/PlanningAccount';
import { Button, CircleButton, Skeleton, Text } from '@/src/components/ui';
import { colors, layout, radius, shadows, spacing } from '@/src/design-system/tokens';
import { resolveHomeCoordinates } from '@/src/services/places/geo-utils';
import { PlanningFamily } from '@/src/services/planning/planner';
import { useFamilyStore } from '@/src/stores/family-store';
import { usePlanningStore } from '@/src/stores/planning-store';

export default function FamiliesScreen() {
  const insets = useSafeAreaInsets();
  const state = usePlanningStore();
  const profile = useFamilyStore((x) => x.profile);
  const [editor, setEditor] = useState<PlanningFamily | null>(null);

  const blank = (mine: boolean): PlanningFamily => {
    const home = mine ? resolveHomeCoordinates(profile) : null;
    return {
      id: mine ? 'mine' : `guest-${Date.now()}`,
      label: mine ? 'Our family' : '',
      area: mine ? profile.homeLocation : '',
      latitude: home?.latitude ?? NaN,
      longitude: home?.longitude ?? NaN,
      ages: mine ? profile.members.filter((m) => m.role === 'child').map((m) => m.age) : [],
      maxDriveMinutes: mine ? profile.maxDriveMinutes : 30,
      budgetTier: mine ? profile.budgetTier : 'moderate',
      pushchair: mine ? Boolean(profile.pushchair) : false,
      required: [],
      routines: mine ? (profile.routines ?? []).map((r) => ({ ...r })) : [],
    };
  };

  if (!state.hydrated) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.xl }]}>
        <View style={styles.gutter}>
          <Skeleton height={132} borderRadius={radius['2xl']} style={styles.skeleton} />
          <Skeleton height={132} borderRadius={radius['2xl']} />
        </View>
      </View>
    );
  }

  const hasMine = state.families.some((family) => family.id === 'mine');

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
      >
        <View style={styles.gutter}>
          <Text variant="display">Families</Text>
          <Text variant="bodySmall" color={colors.text.secondary} style={styles.sub}>
            Your family, and the friends you plan days out with
          </Text>

          {editor ? (
            <View style={styles.editorWrap}>
              <FamilyEditor
                key={editor.id}
                initial={editor}
                onCancel={() => setEditor(null)}
                onSave={(family) => {
                  state.setFamily(family);
                  setEditor(null);
                }}
              />
            </View>
          ) : null}

          {state.families.length === 0 && !editor ? (
            <View style={styles.emptyCard}>
              <Ionicons name="people-outline" size={26} color={colors.text.secondary} />
              <Text variant="heading3" style={styles.emptyTitle}>
                No families yet
              </Text>
              <Text variant="bodySmall" color={colors.text.secondary}>
                Add your own family first so plans can work around your children's ages and routines.
              </Text>
            </View>
          ) : null}

          {state.families.map((family) => (
            <View key={family.id} style={styles.familyCard}>
              <View style={styles.familyTop}>
                <View style={styles.badge}>
                  <Text variant="heading3" color={colors.text.inverse}>
                    {(family.label || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.familyText}>
                  <Text variant="heading3" numberOfLines={1}>
                    {family.label || 'Unnamed family'}
                  </Text>
                  {family.area ? (
                    <Text variant="bodySmall" color={colors.text.secondary} numberOfLines={1}>
                      {family.area}
                    </Text>
                  ) : null}
                </View>
                <CircleButton
                  icon="create-outline"
                  tone="light"
                  size={40}
                  accessibilityLabel={`Edit ${family.label || 'family'}`}
                  onPress={() => setEditor(family)}
                />
              </View>

              <View style={styles.factWrap}>
                <Fact
                  icon="happy-outline"
                  label={family.ages.length ? `Ages ${family.ages.join(', ')}` : 'Adults only'}
                />
                <Fact
                  icon="time-outline"
                  label={
                    family.routines.length
                      ? `${family.routines.length} routine${family.routines.length === 1 ? '' : 's'}`
                      : 'No routines set'
                  }
                />
                <Fact icon="car-outline" label={`Up to ${family.maxDriveMinutes} min`} />
              </View>

              <Button
                label="Remove from this device"
                variant="ghost"
                onPress={() => state.removeFamily(family.id)}
                style={styles.remove}
              />
            </View>
          ))}

          {!hasMine ? (
            <Button
              label="Add your family"
              fullWidth
              trailingArrow
              onPress={() => setEditor(blank(true))}
              style={styles.action}
            />
          ) : null}
          <Button
            label="Add a family on this phone"
            variant="outline"
            fullWidth
            onPress={() => setEditor(blank(false))}
            style={styles.action}
          />

          <View style={styles.accountSection}>
            <Text variant="heading3">Connect with friends</Text>
            <Text variant="caption" color={colors.text.tertiary} style={styles.hint}>
              Family details stay on this device unless you back them up. Connections share only what
              you approve.
            </Text>
            <View style={styles.accountBody}>
              <PlanningAccount />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Fact({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={14} color={colors.text.secondary} />
      <Text variant="caption" color={colors.text.secondary}>
        {label}
      </Text>
    </View>
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
  sub: {
    marginTop: 4,
    marginBottom: spacing.xl,
  },
  skeleton: {
    marginBottom: spacing.lg,
  },
  editorWrap: {
    marginBottom: spacing.lg,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius['2xl'],
    padding: spacing.xl,
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  emptyTitle: {
    marginTop: spacing.md,
    marginBottom: 4,
  },
  familyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius['2xl'],
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  familyTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  badge: {
    width: 46,
    height: 46,
    borderRadius: radius.full,
    backgroundColor: colors.primary[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  familyText: {
    flex: 1,
  },
  factWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.full,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
  },
  remove: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingHorizontal: 0,
  },
  action: {
    marginTop: spacing.sm,
  },
  accountSection: {
    marginTop: spacing['3xl'],
  },
  hint: {
    marginTop: 2,
  },
  accountBody: {
    marginTop: spacing.lg,
  },
});
