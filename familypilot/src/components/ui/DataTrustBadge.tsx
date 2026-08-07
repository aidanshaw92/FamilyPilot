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
  estimated: 'Estimated',
  usually_available: 'Usually available',
  venue_info: 'Venue information',
  community: 'Community confirmed',
  updated_recently: 'Updated recently',
  opening_hours: 'Opening hours from provider',
};

interface DataTrustBadgeProps {
  variant: DataTrustVariant;
  label?: string;
  style?: ViewStyle;
}

export function DataTrustBadge({ variant, label, style }: DataTrustBadgeProps) {
  const text = label ?? TRUST_COPY[variant];

  return (
    <View style={[styles.badge, style]} accessibilityRole="text">
      <Text variant="caption" color={colors.text.secondary}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
});
