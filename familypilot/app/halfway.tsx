import { Redirect, useLocalSearchParams } from 'expo-router';

import { firstValue } from '@/src/services/planning/plan-draft';

/** The old Halfway tab's address. Links, bookmarks and the web's history still arrive here: they land on Together's Meet halfway. */
export default function HalfwayRedirect() {
  const params = useLocalSearchParams();
  const family = firstValue(params.family);
  return <Redirect href={{ pathname: '/together', params: { view: 'halfway', ...(family ? { family } : {}) } } as never} />;
}
