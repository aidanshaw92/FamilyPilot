import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ScreenContainer } from '@/src/components/shared/ScreenContainer';
import { PageHeader } from '@/src/components/navigation/PageHeader';
import { FamilyEditor } from '@/src/components/planning/FamilyEditor';
import { PlanningAccount } from '@/src/components/planning/PlanningAccount';
import { ConnectedFamiliesSection, RoutinesSection, YourFamilySection } from '@/src/components/profile/FamilySections';
import { ArrowCta, Button, Card, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { useFamilyProfile } from '@/src/hooks/use-queries';
import { useTabBarClearance } from '@/src/hooks/use-tab-bar-clearance';
import { PlanningFamily } from '@/src/services/planning/planner';
import { accountRequired, useAuthStore } from '@/src/stores/auth-store';
import { usePlanningStore } from '@/src/stores/planning-store';
import { familyDisplayName } from '@/src/utils/family-title';

/**
 * FAMILIES: who you plan days out with, in the middle of the bottom navigation.
 *
 * Three things, top to bottom: the ways to plan a day together (with the family chosen by "Plan together" kept selected
 * for the next plan, and Meet halfway one tap away); your own household as the planner reads it (people, naps, feeds,
 * must-haves: private by default); and the families you are connected to, as cards that say what they share and what
 * you can do with them.
 *
 * Nothing here is a second system. The connected families are the Profile's Connected Families section
 * (`ConnectedFamiliesSection`, variant `screen`), so invitations, acceptance, what each family sees and disconnecting are
 * the code that already existed, with the same consent and the same limits. A connection is real and persistent (an
 * invitation accepted by the other family, stored with the account); a family added by postcode is on this phone only
 * and its card says so. "Plan together" stores only the family's id (`planningWith`): the next plan sheet opens with
 * them under Who's coming, so nobody re-enters them, and Done clears it.
 */
export default function FamiliesScreen() {
  const router = useRouter();
  const authStatus = useAuthStore((s) => s.status);
  const tabBarClearance = useTabBarClearance();
  const accountsAvailable = accountRequired() && authStatus === 'signed_in';
  const { data: profile } = useFamilyProfile();
  const families = usePlanningStore((s) => s.families);
  const planningWith = usePlanningStore((s) => s.planningWith ?? null);
  const setPlanningWith = usePlanningStore((s) => s.setPlanningWith);
  const setFamily = usePlanningStore((s) => s.setFamily);
  const [editing, setEditing] = useState<PlanningFamily | null>(null);
  const together = useMemo(() => families.find((f) => f.id === planningWith) ?? null, [families, planningWith]);

  const planTogether = (family: PlanningFamily) => {
    setPlanningWith(family.id);
    // Finding a place that suits both begins where places are: Explore, with the banner saying who is coming.
    router.push('/(tabs)/explore' as never);
  };
  const meetHalfway = () => router.push(together ? ({ pathname: '/halfway', params: { family: together.id } } as never) : ('/halfway' as never));

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarClearance }]} keyboardShouldPersistTaps="handled">
        <PageHeader
          title="Families"
          subtitle="Your family, the families you plan with, and the ways to plan a day together."
          flush
          testID="families"
        />

        <Card style={styles.together} testID="families-plan-together-card">
          <Text variant="heading2">Plan a day out together</Text>
          {together ? (
            <>
              <View style={styles.withRow}>
                <View style={styles.withPill} testID="families-planning-with">
                  <Text variant="bodySmall" style={styles.withText} numberOfLines={1}>
                    Planning with {familyDisplayName(together.label)}
                  </Text>
                </View>
                <Button label="Done" size="sm" variant="ghost" onPress={() => setPlanningWith(null)} testID="families-planning-with-done" />
              </View>
              <Text color={colors.text.secondary}>
                Create a plan from any place and {familyDisplayName(together.label)} are already under Who’s coming, with both families’
                journeys and routines worked in.
              </Text>
              <View style={styles.actions}>
                <Button label="Find a place for both" onPress={() => router.push('/(tabs)/explore' as never)} testID="families-find-place" />
              </View>
            </>
          ) : (
            <Text color={colors.text.secondary}>
              Tap Plan together on a family below, and the next plan you create includes them. Or find a place that is fair for
              both families to get to.
            </Text>
          )}
          <ArrowCta label="Meet halfway" size="compact" onPress={meetHalfway} testID="families-go-halfway" />
        </Card>

        {profile ? (
          <>
            <YourFamilySection profile={profile} onEdit={() => router.push('/profile/edit' as never)} />
            <RoutinesSection profile={profile} onEdit={() => router.push('/profile/edit' as never)} />
          </>
        ) : null}

        <Text variant="heading2" style={styles.sectionTitle}>
          Connected families
        </Text>
        {editing ? (
          <FamilyEditor
            key={editing.id}
            initial={editing}
            onCancel={() => setEditing(null)}
            onSave={(family) => {
              setFamily(family);
              setEditing(null);
            }}
          />
        ) : null}
        <ConnectedFamiliesSection
          accountsAvailable={accountsAvailable}
          variant="screen"
          planningWith={planningWith}
          onPlanTogether={planTogether}
          onEditLocal={setEditing}
        />
        <PlanningAccount />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.screenPadding, paddingTop: spacing.sm, gap: spacing.md },
  together: { gap: spacing.md },
  withRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  withPill: { flexShrink: 1, backgroundColor: colors.actionSoft, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 6 },
  withText: { color: colors.action, fontFamily: 'Inter_600SemiBold' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sectionTitle: { marginTop: spacing.sm },
});
