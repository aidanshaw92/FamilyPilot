import { ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { colors, spacing } from '@/src/design-system/tokens';
import { QuickAction } from '@/src/types';

import { QuickActionButton } from './QuickActionButton';

const PRIMARY_ACTIONS: QuickAction[] = [
  {
    id: 'go-outside',
    label: 'Go outside',
    icon: 'sunny-outline',
    color: colors.secondary[500],
    route: '/(tabs)/explore',
  },
  {
    id: 'indoor',
    label: 'Indoor ideas',
    icon: 'home-outline',
    color: colors.accent[500],
    route: '/(tabs)/explore?filter=indoor',
  },
  {
    id: 'need-now',
    label: 'Need something now',
    icon: 'cart-outline',
    color: colors.warning[500],
    route: '/need-now',
  },
  {
    id: 'plan',
    label: 'Plan something',
    icon: 'calendar-outline',
    color: colors.primary[500],
    route: '/(tabs)/trips',
  },
];

/** Secondary utilities — visually quieter, grouped under More. */
const MORE_ACTIONS: QuickAction[] = [
  {
    id: 'holiday',
    label: 'Holiday',
    icon: 'airplane-outline',
    color: colors.text.tertiary,
    route: '/holiday',
  },
  {
    id: 'packing',
    label: 'Packing',
    icon: 'bag-outline',
    color: colors.text.tertiary,
    route: '/packing',
  },
  {
    id: 'car-fit',
    label: 'Car fit',
    icon: 'car-outline',
    color: colors.text.tertiary,
    route: '/car-fit',
  },
  {
    id: 'saved',
    label: 'Saved',
    icon: 'heart-outline',
    color: colors.text.tertiary,
    route: '/(tabs)/saved',
  },
];

export function QuickActionGrid() {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {PRIMARY_ACTIONS.map((action) => (
          <QuickActionButton key={action.id} action={action} subdued />
        ))}
      </View>
      <Text variant="caption" color={colors.text.tertiary} style={styles.moreLabel}>
        More
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.moreRow}>
        {MORE_ACTIONS.map((action) => (
          <QuickActionButton key={action.id} action={action} compact subdued />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    opacity: 0.95,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  moreLabel: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  moreRow: {
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
});
