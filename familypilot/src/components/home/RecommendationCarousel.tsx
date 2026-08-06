import { ScrollView, StyleSheet, View } from 'react-native';

import { DecisionCard } from '@/src/components/shared/DecisionCard';
import { SectionHeader } from '@/src/components/ui';
import { spacing } from '@/src/design-system/tokens';
import { RecommendationSection } from '@/src/types';

interface RecommendationCarouselProps {
  section: RecommendationSection;
  startIndex?: number;
}

export function RecommendationCarousel({ section, startIndex = 0 }: RecommendationCarouselProps) {
  return (
    <View style={styles.container}>
      <SectionHeader title={section.title} subtitle={section.subtitle} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        decelerationRate="fast"
      >
        {section.venues.map((venue, index) => (
          <DecisionCard
            key={venue.id}
            venue={venue}
            variant="carousel"
            index={startIndex + index}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing['3xl'],
  },
  scrollContent: {
    paddingRight: spacing.screenPadding,
  },
});
