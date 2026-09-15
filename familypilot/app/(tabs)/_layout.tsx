import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { FloatingTabBar } from '@/src/components/navigation/FloatingTabBar';
import { isPilotFeatureVisible } from '@/src/config/pilot-features';
import { colors } from '@/src/design-system/tokens';
import { ICON_SIZE } from '@/src/utils/floating-tab-bar-layout';

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

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text.primary,
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
                  size={ICON_SIZE}
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
