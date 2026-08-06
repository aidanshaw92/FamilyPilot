import { ScrollView, StyleSheet, View } from 'react-native';

import { SectionHeader } from '@/src/components/ui';
import { spacing } from '@/src/design-system/tokens';
import { RecommendationSection } from '@/src/types';

import { VenueCard } from '../shared/VenueCard';

interface RecommendationCarouselProps {
  section: RecommendationSection;
}

export function RecommendationCarousel({ section }: RecommendationCarouselProps) {
  return (
    <View style={styles.container}>
      <SectionHeader title={section.title} subtitle={section.subtitle} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {section.venues.map((venue) => (
          <VenueCard key={venue.id} venue={venue} variant="carousel" />
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
