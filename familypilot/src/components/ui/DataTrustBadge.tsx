import { StyleSheet, View, ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/src/design-system/tokens';

import { Text } from './Text';

export type DataTrustVariant =
  | 'estimated'
  | 'usually_available'
  | 'venue_info'
  | 'community'
  | 'updated_recently'
  | 'opening_hours';

const TRUST_COPY: Record<DataTrustVariant, string> = {
  estimated: 'Estimated cost',
  usually_available: 'Usually available',
  venue_info: 'Venue information',
  community: 'Community confirmed',
  updated_recently: 'Last checked recently',
  opening_hours: 'Opening hours from provider',
};

interface DataTrustBadgeProps {
  variant: DataTrustVariant;
  label?: string;
  style?: ViewStyle;
}

/** Information confidence label — clearer than caption, quieter than recommendations. */
export function DataTrustBadge({ variant, label, style }: DataTrustBadgeProps) {
  const text = label ?? TRUST_COPY[variant];

  return (
    <View style={[styles.badge, style]} accessibilityRole="text">
      <Text variant="bodySmall" color={colors.text.secondary} style={styles.label}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 32,
    justifyContent: 'center',
  },
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 18,
  },
});
