import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { DecisionCard } from '@/src/components/shared/DecisionCard';
import { PressableScale } from '@/src/components/ui/PressableScale';
import { FadeInView } from '@/src/components/ui/FadeInView';
import { Text } from '@/src/components/ui/Text';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { Venue } from '@/src/types';

interface TodayHeroCardProps {
  venue: Venue;
}

export function TodayHeroCard({ venue }: TodayHeroCardProps) {
  return (
    <FadeInView style={styles.wrap}>
      <Text variant="body" color={colors.primary[500]} style={styles.label}>
        Today&apos;s Pick
      </Text>
      <DecisionCard venue={venue} variant="hero" index={0} />
    </FadeInView>
  );
}

interface ContinuePlanningCardProps {
  tripTitle: string;
  tripDate: string;
  nextStop: string;
}

export function ContinuePlanningCard({
  tripTitle,
  tripDate,
  nextStop,
}: ContinuePlanningCardProps) {
  const router = useRouter();

  return (
    <FadeInView delay={100}>
      <PressableScale
        onPress={() => router.push('/(tabs)/trips' as never)}
        style={styles.planningCard}
        accessibilityRole="button"
        accessibilityLabel={`Continue planning ${tripTitle}`}
      >
        <View style={styles.planningContent}>
          <Text variant="label" color={colors.accent[600]}>
            Continue planning
          </Text>
          <Text variant="heading3" style={styles.planningTitle}>
            {tripTitle}
          </Text>
          <Text variant="bodySmall" color={colors.text.secondary}>
            {tripDate} · Next: {nextStop}
          </Text>
        </View>
        <Text variant="bodySmall" color={colors.primary[500]} style={styles.planningLink}>
          View plan
        </Text>
      </PressableScale>
    </FadeInView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing['2xl'],
  },
  label: {
    marginBottom: spacing.md,
    fontFamily: 'Inter_600SemiBold',
  },
  planningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent[50],
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.accent[100],
  },
  planningContent: {
    flex: 1,
  },
  planningTitle: {
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  planningLink: {
    fontFamily: 'Inter_600SemiBold',
    paddingLeft: spacing.md,
  },
});
