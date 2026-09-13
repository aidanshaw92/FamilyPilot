import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isPilotFeatureVisible } from '@/src/config/pilot-features';
import { colors, radius, spacing } from '@/src/design-system/tokens';

type TabIcon = keyof typeof Ionicons.glyphMap;

const TAB_CONFIG: {
  name: string;
  title: string;
  icon: TabIcon;
  iconFocused: TabIcon;
  pilotFeature?: import('@/src/config/pilot-features').PilotFeature;
}[] = [
  { name: 'index', title: 'Home', icon: 'home-outline', iconFocused: 'home' },
  { name: 'explore', title: 'Explore', icon: 'compass-outline', iconFocused: 'compass' },
  {
    name: 'trips',
    title: 'Plans',
    icon: 'calendar-outline',
    iconFocused: 'calendar',
    pilotFeature: 'trips_tab',
  },
  {
    name: 'families',
    title: 'Families',
    icon: 'people-outline',
    iconFocused: 'people',
    pilotFeature: 'trips_tab',
  },
  { name: 'saved', title: 'Saved', icon: 'heart-outline', iconFocused: 'heart' },
  { name: 'profile', title: 'Profile', icon: 'person-outline', iconFocused: 'person' },
];

const TAB_BAR_CONTENT_HEIGHT = 56;

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const floatMargin = Math.max(spacing.sm, insets.bottom > 0 ? insets.bottom - spacing.xs : spacing.sm);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary[500],
        tabBarInactiveTintColor: colors.text.tertiary,
        tabBarStyle: {
          position: 'absolute',
          left: spacing.lg,
          right: spacing.lg,
          bottom: floatMargin,
          height: TAB_BAR_CONTENT_HEIGHT + spacing.sm,
          paddingTop: spacing.sm,
          backgroundColor: colors.surface,
          borderTopWidth: 0,
          borderRadius: radius.full,
          ...Platform.select({
            ios: {
              shadowColor: colors.text.primary,
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.12,
              shadowRadius: 20,
            },
            android: { elevation: 10 },
          }),
        },
        tabBarLabelStyle: {
          fontFamily: 'Inter_500Medium',
          fontSize: 10,
          marginTop: 2,
        },
        tabBarItemStyle: {
          paddingVertical: 2,
        },
      }}
    >
      {TAB_CONFIG.map((tab) => {
        const hidden = tab.pilotFeature && !isPilotFeatureVisible(tab.pilotFeature);
        return (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: tab.title,
              href: hidden ? null : undefined,
              tabBarIcon: ({ color, focused }) => (
                <Ionicons
                  name={focused ? tab.iconFocused : tab.icon}
                  size={24}
                  color={color}
                />
              ),
            }}
          />
        );
      })}
    </Tabs>
  );
}
