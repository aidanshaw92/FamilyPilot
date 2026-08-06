import { ScrollView, StyleSheet, View } from 'react-native';

import { QuickActionGrid } from '@/src/components/home/QuickActionGrid';
import { RecommendationCarousel } from '@/src/components/home/RecommendationCarousel';
import { ScreenContainer, ScreenHeader } from '@/src/components/shared/ScreenContainer';
import { Text } from '@/src/components/ui';
import { spacing } from '@/src/design-system/tokens';
import { useFamilyProfile, useHomeRecommendations, useWeather } from '@/src/hooks/use-queries';

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

export default function HomeScreen() {
  const { data: profile } = useFamilyProfile();
  const { data: weather } = useWeather();
  const { data: recommendations } = useHomeRecommendations();

  const parentName = profile?.parentName ?? 'there';

  return (
    <ScreenContainer>
      <ScreenHeader
        timeGreeting={getTimeGreeting()}
        name={parentName}
        weather={weather}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.section}>
          <Text variant="heading2" style={styles.sectionTitle}>
            What would you like to do today?
          </Text>
          <QuickActionGrid />
        </View>

        {recommendations?.map((section) => (
          <RecommendationCarousel key={section.id} section={section} />
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: spacing['5xl'],
  },
  section: {
    marginBottom: spacing['3xl'],
  },
  sectionTitle: {
    marginBottom: spacing.lg,
  },
});
