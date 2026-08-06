import { StyleSheet, View } from 'react-native';

import { FamilyMatch } from './FamilyMatch';
import { colors } from '@/src/design-system/tokens';

interface FamilyScoreBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
}

/** @deprecated Use FamilyMatch with variant="compact" or "detail" */
export function FamilyScoreBadge({ score, size = 'md' }: FamilyScoreBadgeProps) {
  const variant = size === 'lg' ? 'detail' : size === 'sm' ? 'compact' : 'compact';

  return (
    <View style={size === 'sm' ? styles.sm : undefined}>
      <FamilyMatch score={score} variant={variant} />
    </View>
  );
}

const styles = StyleSheet.create({
  sm: {
    transform: [{ scale: 0.85 }],
  },
});
