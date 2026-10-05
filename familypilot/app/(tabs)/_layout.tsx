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
  pilotFeature?: import('@/src/config/pilot-features').PilotFeature;
}[] = [
  { name: 'index', title: 'Home', icon: 'home-outline' },
  { name: 'explore', title: 'Explore', icon: 'compass-outline' },
  {
    name: 'trips',
    title: 'Plans',
    icon: 'calendar-outline',
    pilotFeature: 'trips_tab',
  },
  { name: 'saved', title: 'Saved', icon: 'heart-outline' },
  { name: 'profile', title: 'Profile', icon: 'person-outline' },
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
              // The approved frames draw every tab's icon as an outline, the active one too (it sits
              // on the mint disc in the action green instead of changing glyph).
              tabBarIcon: ({ color, size }) => <Ionicons name={tab.icon} size={size ?? ICON_SIZE} color={color} />,
            }}
          />
        );
      })}
    </Tabs>
  );
}
