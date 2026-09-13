import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/src/design-system/tokens';
import { MatchableVenueFacts } from '@/src/types/day-request';

type Signal = { key: string; icon: keyof typeof Ionicons.glyphMap; label: string };

/** Small glanceable icons for facilities confirmed present, so a parent can tell what's
 * actually on offer without reading a sentence. Never shown for unknown or "no": an icon
 * here is a claim, and an absent icon just means not confirmed, not that it's missing. */
export function FacilitySignals({
  facts,
  size = 14,
}: {
  facts?: Pick<MatchableVenueFacts, 'toilets' | 'babyChanging' | 'parking' | 'pushchairSuitability'>;
  size?: number;
}) {
  if (!facts) return null;

  const signals: Signal[] = [];
  if (facts.toilets === 'yes') signals.push({ key: 'toilets', icon: 'water-outline', label: 'Toilets confirmed' });
  if (facts.parking === 'yes') signals.push({ key: 'parking', icon: 'car-outline', label: 'Parking confirmed' });
  if (facts.babyChanging === 'yes') {
    signals.push({ key: 'babyChanging', icon: 'happy-outline', label: 'Baby changing confirmed' });
  }
  if (facts.pushchairSuitability === 'excellent' || facts.pushchairSuitability === 'good') {
    signals.push({ key: 'pushchair', icon: 'accessibility-outline', label: 'Good for pushchairs' });
  }

  if (signals.length === 0) return null;

  return (
    <View style={styles.row} accessibilityLabel={signals.map((s) => s.label).join(', ')}>
      {signals.map((signal) => (
        <View key={signal.key} style={styles.badge}>
          <Ionicons name={signal.icon} size={size} color={colors.secondary[600]} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
  },
  badge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.secondary[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
