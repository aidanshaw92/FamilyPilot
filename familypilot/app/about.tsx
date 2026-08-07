import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/src/components/ui/BackButton';
import { Text } from '@/src/components/ui';
import { colors, spacing } from '@/src/design-system/tokens';

export default function AboutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile' as never);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackButton onPress={handleBack} />
        <View style={styles.headerText}>
          <Text variant="heading1">About FamilyPilot</Text>
          <Text variant="bodySmall" color={colors.text.secondary}>
            Beta programme · How we handle information
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Section
          title="FamilyPilot beta"
          body="FamilyPilot is in active development with real families. Some venue details, prices, opening hours and shop availability are estimated or sourced from providers and may not be complete."
        />
        <Section
          title="Recommendations"
          body="Family Match scores reflect suitability for your family based on the details you share. They are guidance to help you decide — not guarantees."
        />
        <Section
          title="Prices & availability"
          body="We label estimated costs and use phrases like 'Usually stocks' unless information comes directly from a retailer or venue."
        />
        <Section
          title="Your privacy"
          body="We use your general home area — not your full address — to suggest nearby places. Your family details stay private and are not shared with other users."
        />
        <Section
          title="Feedback"
          body="Your feedback helps us improve FamilyPilot before wider release. Use Send feedback on your Profile screen to share what worked and what did not."
        />
      </ScrollView>
    </View>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.section}>
      <Text variant="heading3">{title}</Text>
      <Text variant="body" color={colors.text.secondary} style={styles.body}>
        {body}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    paddingTop: spacing.xs,
  },
  content: {
    padding: spacing.screenPadding,
    paddingBottom: spacing['3xl'],
  },
  section: {
    marginBottom: spacing['2xl'],
    gap: spacing.sm,
  },
  body: {
    lineHeight: 24,
  },
});
