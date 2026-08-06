import { StyleSheet, View } from 'react-native';

import { colors } from '@/src/design-system/tokens';
import { QuickAction } from '@/src/types';

import { QuickActionButton } from './QuickActionButton';

const PRIMARY_ACTIONS: QuickAction[] = [
  {
    id: 'go-outside',
    label: 'Go Outside',
    icon: 'sun-outline',
    color: colors.secondary[500],
    route: '/(tabs)/explore',
  },
  {
    id: 'indoor',
    label: 'Indoor',
    icon: 'home-outline',
    color: colors.accent[500],
    route: '/(tabs)/explore?filter=indoor',
  },
  {
    id: 'holiday',
    label: 'Plan Holiday',
    icon: 'airplane-outline',
    color: colors.primary[500],
    route: '/holiday',
  },
  {
    id: 'need-now',
    label: 'Need Now',
    icon: 'cart-outline',
    color: colors.warning[500],
    route: '/need-now',
  },
];

const SECONDARY_ACTIONS: QuickAction[] = [
  {
    id: 'restaurants',
    label: 'Restaurants',
    icon: 'restaurant-outline',
    color: colors.coral,
    route: '/(tabs)/explore?filter=restaurants',
  },
  {
    id: 'packing',
    label: 'Packing',
    icon: 'bag-outline',
    color: colors.slateBlue,
    route: '/packing',
  },
  {
    id: 'trips',
    label: 'Trips',
    icon: 'map-outline',
    color: colors.primary[500],
    route: '/(tabs)/trips',
  },
  {
    id: 'car-fit',
    label: 'Car Fit',
    icon: 'car-outline',
    color: colors.steelBlue,
    route: '/car-fit',
  },
];

export function QuickActionGrid() {
  return (
    <View>
      <View style={styles.row}>
        {PRIMARY_ACTIONS.map((action) => (
          <QuickActionButton key={action.id} action={action} />
        ))}
      </View>
      <View style={styles.row}>
        {SECONDARY_ACTIONS.map((action) => (
          <QuickActionButton key={action.id} action={action} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
