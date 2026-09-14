import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';

export default function AddFriendsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const goHome = () => router.replace('/(tabs)' as never);
  const goToFamilies = () => router.replace({ pathname: '/(tabs)/families' } as never);

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="people-circle-outline" size={40} color={colors.text.inverse} />
        </View>
        <Text variant="display" style={styles.heading}>
          Add friends
        </Text>
        <Text variant="body" color={colors.text.secondary} style={styles.subtitle}>
          Connect with other families to plan days out together, share your schedule, and see
          who’s coming. You can always do this later from the Families tab.
        </Text>
      </View>

      <View style={styles.footer}>
        <Button label="Invite a friend" size="lg" fullWidth trailingArrow onPress={goToFamilies} />
        <Button label="Skip for now" variant="ghost" fullWidth onPress={goHome} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.screenPadding,
    justifyContent: 'space-between',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    backgroundColor: colors.primary[500],
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.xl,
  },
  heading: {
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  subtitle: {
    textAlign: 'center',
    lineHeight: 24,
  },
  footer: {
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
});
