import { StyleSheet, View } from 'react-native';

import { RecommendationPattern } from '@/src/components/shared/RecommendationPattern';
import { colors, radius, shadows, spacing } from '@/src/design-system/tokens';
import { FamilyScore, VenueDetail } from '@/src/types';

interface FamilyMatchPanelProps {
  familyScore: FamilyScore;
  venue?: VenueDetail;
  compact?: boolean;
}

export function FamilyMatchPanel({ familyScore, venue, compact = false }: FamilyMatchPanelProps) {
  if (!venue) {
    return null;
  }

  const venueWithScore = { ...venue, familyScore };

  return (
    <View style={[styles.panel, compact && styles.compact]}>
      <RecommendationPattern venue={venueWithScore} variant="detail" showTrust />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.card,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  compact: {
    padding: spacing.md,
  },
});
