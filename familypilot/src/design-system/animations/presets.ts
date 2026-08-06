import { Easing, WithTimingConfig } from 'react-native-reanimated';

export const timing = {
  fast: { duration: 150, easing: Easing.out(Easing.cubic) } satisfies WithTimingConfig,
  normal: { duration: 280, easing: Easing.out(Easing.cubic) } satisfies WithTimingConfig,
  slow: { duration: 400, easing: Easing.out(Easing.cubic) } satisfies WithTimingConfig,
};

export const spring = {
  gentle: { damping: 20, stiffness: 200, mass: 0.8 },
  snappy: { damping: 18, stiffness: 280, mass: 0.6 },
};

export const staggerDelay = (index: number, base = 50) => index * base;
