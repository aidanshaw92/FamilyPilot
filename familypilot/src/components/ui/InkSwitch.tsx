import { Switch, SwitchProps } from 'react-native';

import { colors } from '@/src/design-system/tokens';

/**
 * The app's one on/off control: an ink track and a white thumb, like every other selected state.
 * The platform default draws a teal thumb on web, which is no colour this app uses.
 */
export function InkSwitch(props: SwitchProps) {
  // `activeThumbColor` is react-native-web's name for the thumb while on; React Native's own types
  // do not declare it, and native ignores it, so it travels in a spread.
  const web = { activeThumbColor: colors.surface } as Record<string, unknown>;
  return (
    <Switch
      trackColor={{ true: colors.ink, false: colors.border }}
      thumbColor={colors.surface}
      {...web}
      {...props}
    />
  );
}
