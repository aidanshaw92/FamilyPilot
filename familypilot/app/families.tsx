import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ScreenContainer } from '@/src/components/shared/ScreenContainer';
import { BackButton } from '@/src/components/ui/BackButton';
import { Text } from '@/src/components/ui';
import { ConnectedFamiliesSection } from '@/src/components/profile/FamilySections';
import { colors, spacing } from '@/src/design-system/tokens';
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
      <View style={styles.header}>
        <View style={styles.back}>
          <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)' as never))} />
        </View>
        <Text variant="heading1" testID="families-title">
          Families
        </Text>
        <Text variant="body" color={colors.text.secondary} style={styles.subtitle}>
          Families you plan days out with. Connect one, and you can choose them when you create a plan or find a place to meet
          halfway.
        </Text>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
        <ConnectedFamiliesSection accountsAvailable={accountsAvailable} variant="screen" />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.screenPadding, paddingTop: spacing.sm },
  back: { marginLeft: -12, marginBottom: spacing.xs },
  subtitle: { marginTop: spacing.xs },
  content: { paddingHorizontal: spacing.screenPadding, paddingTop: spacing.md },
});
