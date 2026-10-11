import { ScrollView, StyleSheet } from 'react-native';

import { ScreenContainer } from '@/src/components/shared/ScreenContainer';
import { PageHeader } from '@/src/components/navigation/PageHeader';
import { PlanningAccount } from '@/src/components/planning/PlanningAccount';
import { ConnectedFamiliesSection } from '@/src/components/profile/FamilySections';
import { spacing } from '@/src/design-system/tokens';
import { useTabBarClearance } from '@/src/hooks/use-tab-bar-clearance';
import { accountRequired, useAuthStore } from '@/src/stores/auth-store';

/**
 * FAMILIES: who you plan days out with, in the middle of the bottom navigation.
 *
 * The connected families here are the Profile's Connected Families section (`ConnectedFamiliesSection`, variant
 * `screen`), so invitations, acceptance, what each family sees, and disconnecting are the code that already existed,
 * with the same consent and the same limits. A connected family is then offered under Who's coming when you create a
 * plan, and "Meet halfway" starts from its row here. The planning account (back-up, sign-in) lives here too, since it
 * is what a connection needs.
 */
export default function FamiliesScreen() {
  const authStatus = useAuthStore((s) => s.status);
  const tabBarClearance = useTabBarClearance();
  const accountsAvailable = accountRequired() && authStatus === 'signed_in';

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarClearance }]} keyboardShouldPersistTaps="handled">
        <PageHeader
          title="Families"
          subtitle="Your family, the families you plan with, and the ways to plan a day together."
          flush
          testID="families"
        />
        <ConnectedFamiliesSection accountsAvailable={accountsAvailable} variant="screen" />
        <PlanningAccount />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.screenPadding, paddingTop: spacing.sm, gap: spacing.md },
});
