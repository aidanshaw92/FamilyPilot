import { Tabs } from 'expo-router';

import { FloatingTabBar } from '@/src/components/navigation/FloatingTabBar';
import { isPilotFeatureVisible } from '@/src/config/pilot-features';

type PilotFeature = import('@/src/config/pilot-features').PilotFeature;

/** Five primary destinations, matching the reference's compact nav. Families stays a real
 * route but is reached from Plans and Profile rather than taking a sixth slot, which is
 * what starts making a bar like this feel like OS chrome again. */
const TAB_CONFIG: { name: string; title: string; pilotFeature?: PilotFeature; inBar?: boolean }[] = [
  { name: 'index', title: 'Home' },
  { name: 'explore', title: 'Explore' },
  { name: 'trips', title: 'Plans', pilotFeature: 'trips_tab' },
  { name: 'saved', title: 'Saved' },
  { name: 'profile', title: 'Profile' },
  { name: 'families', title: 'Families', inBar: false },
];

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <FloatingTabBar {...props} />}>
      {TAB_CONFIG.map((tab) => {
        const hidden =
          tab.inBar === false || (tab.pilotFeature && !isPilotFeatureVisible(tab.pilotFeature));
        return (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{ title: tab.title, href: hidden ? null : undefined }}
          />
        );
      })}
    </Tabs>
  );
}
