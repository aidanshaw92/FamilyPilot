import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MeetHalfwayView } from '@/src/components/together/MeetHalfwayView';
import { TogetherSwitch, TogetherView } from '@/src/components/together/TogetherSwitch';
import { YourFamiliesView } from '@/src/components/together/YourFamiliesView';
import { Text } from '@/src/components/ui';
import { colors, spacing } from '@/src/design-system/tokens';
import { useConnectedFamilies } from '@/src/hooks/use-connected-families';
import { isLargeText, useFontScale } from '@/src/hooks/use-font-scale';
import { plannableFamilies } from '@/src/services/planning/family-visibility';
import { firstValue } from '@/src/services/planning/plan-draft';
import { accountRequired, useAuthStore } from '@/src/stores/auth-store';
import { usePlanningStore } from '@/src/stores/planning-store';

/**
 * TOGETHER: everything to do with another family, in one tab (Home, Explore, Together, Plans, Profile). Two views behind a
 * switch at the top, with nothing between the tab and either of them:
 *
 *   Meet halfway: where do we meet (the map, the list, Plan this day)
 *   Your families: who do I plan with (connections, invitations, what I share, families on this phone)
 *
 * WHICH VIEW OPENS. A link that names one (`/together?view=families`, and the old `/halfway` and `/families` addresses, which
 * redirect here) opens that one. Otherwise Meet halfway when there is a family to meet, connected or entered by postcode,
 * because that is the job parents come back for, and Your families when there is nobody yet, because adding a family is the only
 * thing to do. The choice is made once, when the account's connections are known, and never moves under a parent afterwards.
 *
 * BACK AND TAB SELECTION. Together is one place with two views, so changing view never adds a history entry (the address is
 * updated in place, so a link or a reload opens the same view): Back leaves Together to wherever you came from, rather than
 * stepping through every switch, and the switch itself (also reached by a family card's "Meet halfway") is the way between the
 * views. The tab keeps its place when you leave it: coming back finds the view you left.
 *
 * Nothing here reads or writes anything new. The two views are the screens that were the Halfway and Families tabs, unchanged.
 */
export default function TogetherScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  // At the larger text sizes the title and switch stay pinned above a view that scrolls, so the title steps down a size to leave
  // that view some of a small phone.
  const largeText = isLargeText(useFontScale());
  const requested = asView(firstValue(params.view));
  const family = firstValue(params.family) ?? null;

  const authStatus = useAuthStore((s) => s.status);
  const signedIn = accountRequired() && authStatus === 'signed_in';
  const stored = usePlanningStore((s) => s.families);

  // Decided once. The connections are read only while the default is still open (the views read their own, fresh).
  const [view, setView] = useState<TogetherView | null>(requested ?? null);
  const connected = useConnectedFamilies(signedIn && view === null);
  const eligible = useMemo(
    () => plannableFamilies({ stored, accepted: connected.accepted, verified: signedIn && connected.loaded }).length > 0,
    [stored, connected.accepted, connected.loaded, signedIn],
  );
  const known = !signedIn || connected.loaded || stored.length > 0;
  useEffect(() => {
    if (view === null && known) setView(eligible ? 'halfway' : 'families');
  }, [view, known, eligible]);

  // A later link that names a view (the family card's Meet halfway, an old address) moves an open Together to it.
  const seen = useRef(requested);
  useEffect(() => {
    if (requested && requested !== seen.current) setView(requested);
    seen.current = requested;
  }, [requested]);

  const choose = (next: TogetherView, withFamily?: string) => {
    setView(next);
    router.setParams({ view: next, family: withFamily } as never);
  };
  const meetHalfway = (familyId: string) => choose('halfway', familyId);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 9 }]}>
        <Text variant={largeText ? 'heading2' : 'heading1'} accessibilityRole="header" testID="together-title">Together</Text>
        <TogetherSwitch view={view ?? requested ?? 'families'} onChange={(next) => choose(next)} />
      </View>
      {view === null ? (
        <View style={styles.loading} testID="together-loading">
          <ActivityIndicator color={colors.action} accessibilityLabel="Loading" />
        </View>
      ) : view === 'halfway' ? (
        <MeetHalfwayView preselected={family} />
      ) : (
        <YourFamiliesView onMeetHalfway={meetHalfway} />
      )}
    </View>
  );
}

function asView(value: string | undefined): TogetherView | null {
  return value === 'halfway' || value === 'families' ? value : null;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.screenPadding, paddingBottom: 8, gap: 12, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: 'center', paddingTop: spacing.xl },
});
