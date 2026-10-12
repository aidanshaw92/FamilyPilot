import { Tabs } from 'expo-router';

import { FloatingTabBar } from '@/src/components/navigation/FloatingTabBar';
import { isPilotFeatureVisible } from '@/src/config/pilot-features';
import { colors } from '@/src/design-system/tokens';

const TAB_CONFIG: {
  name: string;
  title: string;
  pilotFeature?: import('@/src/config/pilot-features').PilotFeature;
}[] = [
  { name: 'index', title: 'Home' },
  { name: 'explore', title: 'Explore' },
  // Families is the hub for who a parent plans with: the families they are connected to, invitations, what they share, and
  // Plan together. Halfway is the other half of that job and a destination of its own, one tap from anywhere: a map of
  // places that work for two families. A connected family's card in Families still offers it, pre-selected. Saved places
  // open from Plans (app/saved.tsx).
  { name: 'families', title: 'Families' },
  { name: 'halfway', title: 'Halfway' },
  {
    name: 'trips',
    title: 'Plans',
    pilotFeature: 'trips_tab',
  },
  { name: 'profile', title: 'Profile' },
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
              // The icons are the approved frames' own vectors, drawn by the floating tab bar itself.
            }}
          />
        );
      })}
    </Tabs>
  );
}
