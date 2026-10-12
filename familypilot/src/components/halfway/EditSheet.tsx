import { Ionicons } from '@expo/vector-icons';
import { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';

import { AddFamilyByPostcode } from '@/src/components/planning/AddFamilyByPostcode';
import { Button, Chip, Text } from '@/src/components/ui';
import { DateField, TimeField } from '@/src/components/ui/DateTimeField';
import { colors, fontFamily, radius, shadows, spacing } from '@/src/design-system/tokens';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { startingPointLabel } from '@/src/services/planning/halfway-view';
import { PlanningFamily } from '@/src/services/planning/planner';
import { familyDisplayName } from '@/src/utils/family-title';
import { dateQuickChoices, shortDateLabel } from '@/src/utils/plan-quick-choices';

export type MeetingEnvironment = 'either' | 'indoor' | 'outdoor';

function Row({ icon, title, detail, onPress, testID, flush = false }: { icon: keyof typeof Ionicons.glyphMap; title: string; detail: string; onPress?: () => void; testID?: string; flush?: boolean }) {
  return (
    <Pressable
      style={[styles.row, flush && styles.rowFlush]}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={`${title}. ${detail}`}
      testID={testID}
    >
      <View style={styles.rowIcon}><Ionicons name={icon} size={20} color={colors.action} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDetail} numberOfLines={2}>{detail}</Text>
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} /> : null}
    </Pressable>
  );
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <View style={styles.section}>
    <Text variant="heading3" accessibilityRole="header">{title}</Text>
    {children}
  </View>
);

/**
 * Edit meeting details: who you are meeting, when, and indoors or outdoors, the same inputs the engine already takes. The
 * places underneath update as you change them ("Done" only closes the sheet). Both families' starting points are shown to
 * the district (the first part of a postcode) and are read-only: yours is edited in your profile, and the other family's is
 * theirs to share. Nothing here pretends to set a travel mode, a journey limit or another family: those are not offered.
 */
export function HalfwayEditSheet({
  top,
  bottomClearance,
  candidates,
  chosen,
  onChoose,
  adding,
  onToggleAdding,
  onAdded,
  mine,
  other,
  date,
  onDate,
  startAt,
  onStartAt,
  dateOpen,
  onDateOpen,
  today,
  environment,
  onEnvironment,
  onEditProfile,
  onClose,
}: {
  top: number;
  bottomClearance: number;
  candidates: { id: string; label: string }[];
  chosen: string | null;
  onChoose: (id: string) => void;
  adding: boolean;
  onToggleAdding: () => void;
  onAdded: (family: PlanningFamily) => void;
  mine: PlanningFamily | null;
  other: PlanningFamily | null;
  date: string;
  onDate: (date: string) => void;
  startAt: string;
  onStartAt: (time: string) => void;
  dateOpen: boolean;
  onDateOpen: (open: boolean) => void;
  today: string;
  environment: MeetingEnvironment;
  onEnvironment: (environment: MeetingEnvironment) => void;
  onEditProfile: () => void;
  onClose: () => void;
}) {
  const reduced = useReducedMotion();
  const choices = dateQuickChoices(today);
  const quick = choices.some((choice) => choice.value === date);
  const limit = mine && typeof mine.maxDriveMinutes === 'number' ? `Your limit: ${mine.maxDriveMinutes} min` : 'No limit set';
  const needs = mine && mine.required.length > 0 ? `Yours: ${mine.required.length} ${mine.required.length === 1 ? 'must-have' : 'must-haves'}` : 'None set for you';
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" testID="halfway-edit-sheet">
      <Animated.View entering={reduced ? undefined : FadeIn.duration(160)} style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View entering={reduced ? undefined : SlideInDown.duration(240)} style={[styles.sheet, { top }]} accessibilityViewIsModal accessibilityLabel="Edit meeting details">
        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <Text variant="heading2" accessibilityRole="header">Edit meeting details</Text>
            <Pressable style={styles.close} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" testID="halfway-edit-close">
              <Ionicons name="close" size={22} color={colors.ink} />
            </Pressable>
          </View>

          <Section title="Who are you meeting?">
            <View style={styles.chips}>
              {candidates.map((candidate) => (
                <Chip key={candidate.id} size="small" label={familyDisplayName(candidate.label)} active={chosen === candidate.id} onPress={() => onChoose(candidate.id)} testID={`halfway-who-${candidate.id}`} />
              ))}
              <Chip size="small" label="+ Add by postcode" active={adding} onPress={onToggleAdding} testID="halfway-add-by-postcode" />
            </View>
            {adding ? <AddFamilyByPostcode onAdded={onAdded} onCancel={onToggleAdding} /> : null}
            {mine && other ? (
              <Row
                icon="location-outline"
                title="Starting points"
                detail={`You: ${startingPointLabel(mine.area)} · ${familyDisplayName(other.label)}: ${startingPointLabel(other.area)}`}
                onPress={onEditProfile}
                testID="halfway-starting-points"
                flush
              />
            ) : null}
          </Section>

          <Section title="When">
            <View style={styles.chips}>
              {choices.map((choice) => (
                <Chip
                  key={choice.value}
                  size="small"
                  label={choice.label}
                  active={date === choice.value}
                  onPress={() => {
                    onDateOpen(false);
                    onDate(choice.value);
                  }}
                />
              ))}
              <Chip size="small" label={!quick ? shortDateLabel(date) : 'Other date'} active={!quick || dateOpen} onPress={() => onDateOpen(true)} />
            </View>
            {dateOpen || !quick ? <DateField label="" a11yLabel="Date of the meeting" value={date} onChange={onDate} /> : null}
            <Text style={styles.fieldLabel}>Arrival time</Text>
            <TimeField label="" a11yLabel="Arrival time" value={startAt} onChange={onStartAt} />
            <Text variant="caption" color={colors.text.secondary}>When you’d both like to arrive. Each family’s leaving time is worked out from its own journey.</Text>
          </Section>

          <Section title="Indoor or outdoor">
            <View style={styles.chips}>
              {(['either', 'indoor', 'outdoor'] as const).map((value) => (
                <Chip key={value} size="small" label={value === 'either' ? 'Either' : value === 'indoor' ? 'Indoor' : 'Outdoor'} active={environment === value} onPress={() => onEnvironment(value)} testID={`halfway-env-${value}`} />
              ))}
            </View>
          </Section>

          <Section title="From your family profiles">
            <View style={styles.group}>
              <Row icon="time-outline" title="Longest journey" detail={`${limit} · change in each profile`} onPress={onEditProfile} testID="halfway-row-limit" />
              <View style={styles.divider} />
              <Row icon="heart-outline" title="What each family needs" detail={`${needs} · the other family’s come from what they share`} onPress={onEditProfile} testID="halfway-row-needs" />
            </View>
          </Section>
          <View style={{ height: bottomClearance + 96 }} />
        </ScrollView>
        <View style={[styles.pinned, { paddingBottom: bottomClearance - 10 }]}>
          <Button label="Done" size="lg" fullWidth onPress={onClose} testID="halfway-edit-done" />
          <Text variant="caption" color={colors.text.secondary}>Places update as you change these.</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.sheetScrim },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.background, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, overflow: 'hidden', ...shadows.bottomSheet },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.screenPadding, paddingTop: 8, gap: 16 },
  grabber: { alignSelf: 'flex-start', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: -6 },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  section: { gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fieldLabel: { fontFamily: fontFamily.semiBold, fontSize: 13, lineHeight: 18, color: colors.text.secondary },
  group: { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.borderLight },
  divider: { height: 1, backgroundColor: colors.borderLight, marginHorizontal: 16 },
  rowFlush: { paddingHorizontal: 0 },
  row: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  rowIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.actionSoft, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: fontFamily.semiBold, fontSize: 15, lineHeight: 20, color: colors.ink },
  rowDetail: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 17, color: colors.text.secondary },
  pinned: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.screenPadding, paddingTop: 12, gap: 6, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.borderLight },
});
