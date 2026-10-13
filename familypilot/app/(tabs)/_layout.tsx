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
  // Together is everything to do with another family, behind one switch: Meet halfway (a map of places that work for two
  // families) and Your families (who a parent plans with: connections, invitations, what they share, Plan together). The old
  // /halfway and /families addresses redirect into it (app/halfway.tsx, app/families.tsx). Saved places open from Plans.
  { name: 'together', title: 'Together' },
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
