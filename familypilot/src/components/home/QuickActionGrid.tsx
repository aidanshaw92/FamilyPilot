import { ScrollView, StyleSheet, View } from 'react-native';

import { isPilotFeatureVisible } from '@/src/config/pilot-features';
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
    pilotFeature: 'plan_something_action',
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
    pilotFeature: 'holiday',
  },
  {
    id: 'packing',
    label: 'Packing',
    icon: 'bag-outline',
    color: colors.text.tertiary,
    route: '/packing',
    pilotFeature: 'packing',
  },
  {
    id: 'car-fit',
    label: 'Car fit',
    icon: 'car-outline',
    color: colors.text.tertiary,
    route: '/car-fit',
    pilotFeature: 'car_fit',
  },
  {
    id: 'saved',
    label: 'Saved',
    icon: 'heart-outline',
    color: colors.text.tertiary,
    route: '/(tabs)/saved',
  },
];

function visibleActions(actions: QuickAction[]): QuickAction[] {
  return actions.filter(
    (action) => !action.pilotFeature || isPilotFeatureVisible(action.pilotFeature),
  );
}

export function QuickActionGrid() {
  const primaryActions = visibleActions(PRIMARY_ACTIONS);
  const moreActions = visibleActions(MORE_ACTIONS);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {primaryActions.map((action) => (
          <QuickActionButton key={action.id} action={action} subdued />
        ))}
      </View>
      {moreActions.length > 0 ? (
        <>
          <Text variant="caption" color={colors.text.tertiary} style={styles.moreLabel}>
            More
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.moreRow}>
            {moreActions.map((action) => (
              <QuickActionButton key={action.id} action={action} compact subdued />
            ))}
          </ScrollView>
        </>
      ) : null}
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
