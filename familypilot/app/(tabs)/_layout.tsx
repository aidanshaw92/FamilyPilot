import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isPilotFeatureVisible } from '@/src/config/pilot-features';
import { colors, spacing } from '@/src/design-system/tokens';

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
  { name: 'saved', title: 'Saved', icon: 'heart-outline', iconFocused: 'heart' },
  { name: 'profile', title: 'Profile', icon: 'person-outline', iconFocused: 'person' },
];

const TAB_BAR_CONTENT_HEIGHT = 56;

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(spacing.sm, insets.bottom);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text.primary,
        tabBarInactiveTintColor: '#A7ADB0',
        tabBarStyle: {
          position: 'absolute',
          left: spacing.md,
          right: spacing.md,
          bottom: Math.max(spacing.sm, insets.bottom),
          height: TAB_BAR_CONTENT_HEIGHT,
          borderTopWidth: 0,
          borderRadius: 30,
          backgroundColor: colors.text.primary,
          paddingTop: 6,
          paddingBottom: 6,
          shadowColor: '#172026',
          shadowOpacity: 0.18,
          shadowRadius: 16,
          elevation: 8,
        },
        tabBarLabelStyle: {
          fontFamily: 'Inter_500Medium',
          fontSize: 11,
          marginTop: 2,
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
