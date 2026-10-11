import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';

import { ScreenContainer } from '@/src/components/shared/ScreenContainer';
import { PageHeader } from '@/src/components/navigation/PageHeader';
import { ConnectedFamiliesSection } from '@/src/components/profile/FamilySections';
import { spacing } from '@/src/design-system/tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { accountRequired, useAuthStore } from '@/src/stores/auth-store';

/**
 * FAMILIES: who you plan days out with, in one place, reached from the Families action on Home and Explore.
 *
 * Not a tab (the bottom navigation keeps its five) and not a second system: it is the Profile's Connected Families section
 * on its own screen (`ConnectedFamiliesSection`, variant `screen`), so invitations, acceptance, what each family sees, and
 * disconnecting are the code that already existed, with the same consent and the same limits. A connected family is then
 * offered under Who's coming when you create a plan, and "Meet halfway" starts from its row here.
 */
export default function FamiliesScreen() {
  const router = useRouter();
  const authStatus = useAuthStore((s) => s.status);
  // A stack screen, so there is no floating navigation to clear: only the device's own bottom edge.
  const insets = useSafeAreaInsets();
  const accountsAvailable = accountRequired() && authStatus === 'signed_in';

  return (
    <ScreenContainer>
      <PageHeader
        title="Families"
        subtitle="Families you plan days out with. Connect one, and you can choose them when you create a plan or find a place to meet halfway."
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)' as never))}
        testID="families"
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
        <ConnectedFamiliesSection accountsAvailable={accountsAvailable} variant="screen" />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.screenPadding, paddingTop: spacing.md },
});
