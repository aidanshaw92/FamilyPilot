import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ItineraryCard, ItinerarySlot } from '@/src/components/planning/ItineraryCard';
import { PlanInviteSheet } from '@/src/components/planning/PlanInviteSheet';
import {
  BottomSheet,
  Button,
  Chip,
  CircleButton,
  DateField,
  EmptyState,
  PillSelector,
  Skeleton,
  Text,
  TimeField,
} from '@/src/components/ui';
import { colors, layout, radius, spacing } from '@/src/design-system/tokens';
import { useEatNearby, useFamilyProfile, useVenue } from '@/src/hooks/use-queries';
import { resolveHomeCoordinates } from '@/src/services/places/geo-utils';
import { clockLabel, sharePlanText } from '@/src/services/planning/planner';
import { buildPlanForVenue, planningFamilyFromProfile } from '@/src/services/planning/plan-from-venue';
import { localDate, usePlanningStore } from '@/src/stores/planning-store';
import { isPilotFeatureVisible } from '@/src/config/pilot-features';
import { formatCategory } from '@/src/utils/format-category';

const TABS = [
  { id: 'plan', label: 'Your plan' },
  { id: 'who', label: "Who's coming" },
  { id: 'details', label: 'Plan details' },
];

const VISIT_LENGTHS = [60, 90, 120, 180];

function formatPlanDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function PlanBuilderScreen() {
  const { venueId } = useLocalSearchParams<{ venueId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: venue, isLoading } = useVenue(venueId ?? '');
  const { data: profile } = useFamilyProfile();
  const { data: eatNearby } = useEatNearby(
    isPilotFeatureVisible('explore_restaurants') ? venueId : undefined,
  );

  const planning = usePlanningStore();
  const [tab, setTab] = useState('plan');
  const [expanded, setExpanded] = useState<string | null>('activity');
  const [editOpen, setEditOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [lunchId, setLunchId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (planning.hydrated && planning.options.date < localDate()) {
      planning.setOptions({ date: localDate() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planning.hydrated]);

  // Plan around the household profile unless the parent has set up planning families,
  // in which case the ones they selected there are the source of truth.
  const families = useMemo(() => {
    const saved = planning.families.filter((f) => f.id === 'mine');
    if (saved.length) return saved;
    if (!profile) return [];
    return [planningFamilyFromProfile(profile, resolveHomeCoordinates(profile))];
  }, [planning.families, profile]);

  const lunch = useMemo(
    () => (eatNearby ?? []).find((option) => option.restaurantId === lunchId) ?? null,
    [eatNearby, lunchId],
  );

  const plan = useMemo(() => {
    if (!venue || !families.length) return null;
    const mealMinutes = lunch ? 45 + 10 : 0;
    return buildPlanForVenue(venue, families, {
      ...planning.options,
      visitMinutes: planning.options.visitMinutes + mealMinutes,
    });
  }, [venue, families, planning.options, lunch]);

  if (isLoading || !venue) {
    return (
      <View style={styles.screen}>
        <View style={[styles.loading, { paddingTop: insets.top + spacing['3xl'] }]}>
          <Skeleton height={32} style={styles.loadingGap} />
          <Skeleton height={120} style={styles.loadingGap} />
          <Skeleton height={120} />
        </View>
      </View>
    );
  }

  const timing = plan?.timings[0];
  const visitEnd = plan ? plan.start + planning.options.visitMinutes : null;

  const activitySlots: ItinerarySlot[] = timing
    ? [
        { label: 'Leave home', text: `${clockLabel(timing.depart)} · about ${timing.journey.outbound} min drive, estimated` },
        { label: 'Arrive', text: `${clockLabel(plan!.start)} at ${venue.name}` },
        {
          label: 'Stay',
          text: `About ${Math.round(planning.options.visitMinutes / 60 * 10) / 10} hours${
            venue.visitDurationMinutes ? `, typical visit is ${Math.round(venue.visitDurationMinutes / 60)}h` : ''
          }`,
        },
      ]
    : [];

  const lunchSlots: ItinerarySlot[] = lunch && visitEnd
    ? [
        { label: 'Lunch', text: `${clockLabel(visitEnd + 10)} at ${lunch.name}, about 45 minutes` },
        { label: 'Getting there', text: `${lunch.driveMinutes} min from ${venue.name}` },
      ]
    : [];

  const homeSlots: ItinerarySlot[] = timing
    ? [
        { label: 'Leave', text: `${clockLabel(timing.leaveVenue)}` },
        { label: 'Home', text: `About ${clockLabel(timing.home)}, ${timing.journey.inbound} min drive` },
      ]
    : [];

  const routineNote = timing?.notes[0];

  const handleSave = () => {
    if (!plan) return;
    planning.savePlan({
      id: `${planning.options.date}-${plan.venueId}`,
      date: planning.options.date,
      plan,
      checked: [],
      createdAt: new Date().toISOString(),
    });
    setMessage('Plan saved. You can find it under Plans.');
  };

  const handleShare = async () => {
    if (!plan) return;
    try {
      await Share.share({ message: sharePlanText(plan, planning.options.date) });
    } catch {
      setMessage('Sharing is unavailable on this device.');
    }
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <CircleButton
          icon="chevron-back"
          accessibilityLabel="Go back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)' as never))}
        />
        <View style={styles.headerText}>
          <Text variant="heading2" numberOfLines={1}>
            {venue.name} plan
          </Text>
          <Text variant="caption" color={colors.text.secondary} numberOfLines={1}>
            {formatPlanDate(planning.options.date)}
          </Text>
        </View>
        <CircleButton
          icon="create-outline"
          accessibilityLabel="Edit plan timings"
          onPress={() => setEditOpen(true)}
        />
      </View>

      <View style={styles.tabs}>
        <PillSelector options={TABS} value={tab} onChange={setTab} scroll={false} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {message ? (
          <Text variant="bodySmall" color={colors.text.secondary} style={styles.message} accessibilityRole="alert">
            {message}
          </Text>
        ) : null}

        {tab === 'plan' ? (
          !plan ? (
            <EmptyState
              icon="calendar-outline"
              title="This one does not fit yet"
              message={
                families.length
                  ? 'With your current times and routines we cannot fit this place in without cutting it fine. Try a longer day or a different start time.'
                  : 'Add your family under Families first so we know who is coming.'
              }
              actionLabel={families.length ? 'Adjust timings' : 'Set up your family'}
              onAction={() =>
                families.length ? setEditOpen(true) : router.push('/(tabs)/families' as never)
              }
            />
          ) : (
            <>
              <Text variant="heading1" style={styles.planTitle}>
                Your day at {venue.name}
              </Text>
              <Text variant="bodySmall" color={colors.text.secondary} style={styles.planSub}>
                {clockLabel(timing!.depart)} to {clockLabel(timing!.home)} · {families.length}{' '}
                {families.length === 1 ? 'family' : 'families'}
              </Text>

              <ItineraryCard
                eyebrow="Stop 1"
                title={`${formatCategory(venue.category)} at ${venue.name}`}
                imageUrl={venue.photos?.[0] ?? venue.imageUrl}
                category={venue.category}
                expanded={expanded === 'activity'}
                onToggle={() => setExpanded(expanded === 'activity' ? null : 'activity')}
                slots={activitySlots}
                note={routineNote}
                actions={
                  <Button
                    label="Change timings"
                    variant="secondary"
                    size="sm"
                    onPress={() => setEditOpen(true)}
                  />
                }
              />

              {lunch ? (
                <ItineraryCard
                  eyebrow="Lunch"
                  title={lunch.name}
                  imageUrl={lunch.imageUrl}
                  category="restaurant"
                  expanded={expanded === 'lunch'}
                  onToggle={() => setExpanded(expanded === 'lunch' ? null : 'lunch')}
                  slots={lunchSlots}
                  actions={
                    <Button
                      label="Remove lunch"
                      variant="secondary"
                      size="sm"
                      onPress={() => setLunchId(null)}
                    />
                  }
                />
              ) : (eatNearby ?? []).length > 0 ? (
                <View style={styles.addStop}>
                  <Text variant="heading3">Add lunch</Text>
                  <Text variant="bodySmall" color={colors.text.secondary} style={styles.addStopHint}>
                    We will fold the travel and the meal into your timings.
                  </Text>
                  <View style={styles.addStopChips}>
                    {(eatNearby ?? []).slice(0, 4).map((option) => (
                      <Chip
                        key={option.restaurantId}
                        label={`${option.name} · ${option.driveMinutes} min`}
                        onPress={() => {
                          setLunchId(option.restaurantId);
                          setExpanded('lunch');
                        }}
                      />
                    ))}
                  </View>
                </View>
              ) : null}

              <ItineraryCard
                eyebrow="Heading home"
                title="Home"
                category="park"
                expanded={expanded === 'home'}
                onToggle={() => setExpanded(expanded === 'home' ? null : 'home')}
                slots={homeSlots}
              />

              <Text variant="caption" color={colors.text.secondary} style={styles.disclaimer}>
                Travel times are estimates and opening hours are not verified. Check before you
                leave.
              </Text>
            </>
          )
        ) : null}

        {tab === 'who' ? (
          <View style={styles.panel}>
            <Text variant="heading3">Who is coming</Text>
            {families.map((family) => (
              <View key={family.id} style={styles.familyRow}>
                <Ionicons name="people-outline" size={18} color={colors.text.secondary} />
                <View style={styles.familyText}>
                  <Text variant="body">{family.label}</Text>
                  <Text variant="caption" color={colors.text.secondary}>
                    {family.area}
                    {family.ages.length ? ` · ages ${family.ages.join(', ')}` : ''}
                  </Text>
                </View>
              </View>
            ))}
            <Button
              label="Invite another family"
              variant="outline"
              fullWidth
              onPress={() => setInviteOpen(true)}
              style={styles.panelAction}
            />
            <Button
              label="Manage families and routines"
              variant="ghost"
              fullWidth
              onPress={() => router.push('/(tabs)/families' as never)}
            />
          </View>
        ) : null}

        {tab === 'details' ? (
          <View style={styles.panel}>
            <Text variant="heading3">Plan details</Text>
            <DetailRow label="Place" value={venue.name} />
            <DetailRow label="Date" value={formatPlanDate(planning.options.date)} />
            <DetailRow label="Leave home from" value={planning.options.leaveAt} />
            <DetailRow
              label="Time at the activity"
              value={`${planning.options.visitMinutes} minutes`}
            />
            {venue.address ? <DetailRow label="Address" value={venue.address} /> : null}
            {venue.openingHours ? (
              <DetailRow label="Opening hours" value={venue.openingHours} />
            ) : null}
            <Button
              label="Change timings"
              variant="outline"
              fullWidth
              onPress={() => setEditOpen(true)}
              style={styles.panelAction}
            />
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.cta, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.ctaRow}>
          <Button
            label="Save plan"
            variant="outline"
            onPress={handleSave}
            disabled={!plan}
            style={styles.ctaSecondary}
          />
          <Button
            label="Share plan"
            size="lg"
            onPress={() => void handleShare()}
            disabled={!plan}
            style={styles.ctaPrimary}
          />
        </View>
      </View>

      <BottomSheet
        visible={editOpen}
        onClose={() => setEditOpen(false)}
        title="Adjust your day"
        footer={<Button label="Update plan" size="lg" fullWidth onPress={() => setEditOpen(false)} />}
      >
        <DateField
          label="Date"
          value={planning.options.date}
          onChange={(date) => planning.setOptions({ date })}
        />
        <TimeField
          label="Earliest you can leave"
          value={planning.options.leaveAt}
          onChange={(leaveAt) => planning.setOptions({ leaveAt })}
        />
        <TimeField
          label="Everyone home by (optional)"
          value={planning.options.returnBy}
          onChange={(returnBy) => planning.setOptions({ returnBy })}
          optional
        />
        <Text variant="label" style={styles.sheetLabel}>
          Time at the activity
        </Text>
        <View style={styles.sheetChips}>
          {VISIT_LENGTHS.map((minutes) => (
            <Chip
              key={minutes}
              label={`${minutes} min`}
              active={planning.options.visitMinutes === minutes}
              onPress={() => planning.setOptions({ visitMinutes: minutes })}
            />
          ))}
        </View>
        <Text variant="label" style={styles.sheetLabel}>
          Extra time each way for traffic and getting ready
        </Text>
        <View style={styles.sheetChips}>
          {[10, 15, 30].map((minutes) => (
            <Chip
              key={minutes}
              label={`${minutes} min`}
              active={planning.options.bufferMinutes === minutes}
              onPress={() => planning.setOptions({ bufferMinutes: minutes })}
            />
          ))}
        </View>
      </BottomSheet>

      <PlanInviteSheet
        visible={inviteOpen}
        onClose={() => setInviteOpen(false)}
        plan={plan}
        date={planning.options.date}
        onMessage={setMessage}
      />
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text variant="caption" color={colors.text.tertiary}>
        {label}
      </Text>
      <Text variant="body" style={styles.detailValue}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loading: {
    paddingHorizontal: spacing.screenPadding,
  },
  loadingGap: {
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: spacing.lg,
  },
  headerText: {
    flex: 1,
    alignItems: 'center',
  },
  tabs: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: spacing.xl,
  },
  scroll: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: layout.ctaClearance,
  },
  message: {
    marginBottom: spacing.lg,
  },
  planTitle: {
    marginBottom: 4,
  },
  planSub: {
    marginBottom: spacing.xl,
  },
  addStop: {
    padding: spacing.lg,
    borderRadius: radius['2xl'],
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    marginBottom: spacing.md,
  },
  addStopHint: {
    marginTop: 2,
    marginBottom: spacing.md,
  },
  addStopChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  disclaimer: {
    marginTop: spacing.lg,
  },
  panel: {
    padding: spacing.xl,
    borderRadius: radius['2xl'],
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  familyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  familyText: {
    flex: 1,
  },
  panelAction: {
    marginTop: spacing.sm,
  },
  detailRow: {
    gap: 2,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  detailValue: {
    lineHeight: 21,
  },
  cta: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.lg,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  ctaSecondary: {
    flex: 1,
  },
  ctaPrimary: {
    flex: 1.4,
  },
  sheetLabel: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  sheetChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
