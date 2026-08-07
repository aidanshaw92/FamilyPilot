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
  diningHint?: string;
}

export function TodayHeroCard({ venue, diningHint }: TodayHeroCardProps) {
  return (
    <FadeInView style={styles.wrap}>
      <View style={styles.header}>
        <Text variant="heading3" color={colors.primary[600]}>
          Today&apos;s Pick
        </Text>
        <Text variant="bodySmall" color={colors.text.secondary} style={styles.subtitle}>
          Our best suggestion for your family right now
        </Text>
        {diningHint ? (
          <Text variant="bodySmall" color={colors.secondary[600]} style={styles.diningHint}>
            {diningHint}
          </Text>
        ) : null}
      </View>
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
          <Text variant="caption" color={colors.text.tertiary}>
            Continue planning
          </Text>
          <Text variant="body" style={styles.planningTitle}>
            {tripTitle}
          </Text>
          <Text variant="caption" color={colors.text.secondary}>
            {tripDate} · Next: {nextStop}
          </Text>
        </View>
        <Text variant="caption" color={colors.primary[500]} style={styles.planningLink}>
          View plan
        </Text>
      </PressableScale>
    </FadeInView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing['3xl'],
  },
  header: {
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  subtitle: {
    lineHeight: 20,
  },
  diningHint: {
    marginTop: spacing.xs,
    fontFamily: 'Inter_500Medium',
    lineHeight: 20,
  },
  planningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  planningContent: {
    flex: 1,
  },
  planningTitle: {
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
    fontFamily: 'Inter_500Medium',
  },
  planningLink: {
    fontFamily: 'Inter_600SemiBold',
    paddingLeft: spacing.md,
  },
});
