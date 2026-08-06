import { StyleSheet, View, ViewProps } from 'react-native';

import { colors, radius, shadows, spacing } from '@/src/design-system/tokens';

interface CardProps extends ViewProps {
  padding?: keyof typeof spacing | number;
  elevated?: boolean;
}

export function Card({ padding = 'lg', elevated = true, style, children, ...props }: CardProps) {
  const paddingValue = typeof padding === 'number' ? padding : spacing[padding];

  return (
    <View
      style={[
        styles.card,
        elevated && shadows.card,
        { padding: paddingValue },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
});
