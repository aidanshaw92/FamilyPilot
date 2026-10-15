import { StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui';
import { colors, spacing } from '@/src/design-system/tokens';
import { Venue } from '@/src/types';
import { ageGuidance, facilityEvidence, facilityLines } from '@/src/utils/explore-evidence';
import { classify } from '@/src/utils/venue-classification';

/**
 * Under an Explore card's meta line: what the venue's own pages say about its kind (for the reviewed play venues), what is known
 * about ages, and which facilities are confirmed, confirmed absent, or simply not recorded. Never a guess: a missing fact reads
 * "Not recorded", and a typical age says it is typical.
 */
export function ExploreCardEvidence({ venue, reason }: { venue: Venue; reason?: string }) {
  const age = ageGuidance(venue);
  const lines = facilityLines(facilityEvidence(venue));
  const evidence = classify(venue).evidence;
  return (
    <View style={styles.wrap} testID={`explore-evidence-${venue.id}`}>
      {evidence.map((line) => (
        <Text key={line} variant="caption" color={colors.text.secondary}>{line}</Text>
      ))}
      <Text variant="caption" color={age.kind === 'recorded' ? colors.secondary[600] : colors.text.secondary} testID={`explore-age-${age.kind}`}>{age.text}</Text>
      {lines.map((line) => (
        <Text key={line} variant="caption" color={line.startsWith('Confirmed') ? colors.secondary[600] : colors.text.secondary}>{line}</Text>
      ))}
      {reason ? <Text variant="caption" color={colors.warning[600]} style={styles.reason}>{reason}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 2, marginTop: spacing.xs },
  reason: { fontFamily: 'Inter_600SemiBold' },
});
