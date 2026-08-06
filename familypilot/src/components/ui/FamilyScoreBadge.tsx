import { StyleSheet, View } from 'react-native';

import { colors, radius } from '@/src/design-system/tokens';

import { Text } from './Text';

interface FamilyScoreBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
}

export function FamilyScoreBadge({ score, size = 'md' }: FamilyScoreBadgeProps) {
  const dimensions = size === 'sm' ? 36 : size === 'lg' ? 56 : 44;
  const fontSize = size === 'sm' ? 14 : size === 'lg' ? 22 : 18;

  return (
    <View
      accessibilityLabel={`Family score ${score} out of 100`}
      accessibilityRole="text"
      style={[
        styles.badge,
        { width: dimensions, height: dimensions, borderRadius: dimensions / 2 },
      ]}
    >
      <Text style={[styles.score, { fontSize }]} color={colors.text.inverse}>
        {score}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.secondary[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  score: {
    fontFamily: 'Inter_700Bold',
    fontWeight: '700',
  },
});
