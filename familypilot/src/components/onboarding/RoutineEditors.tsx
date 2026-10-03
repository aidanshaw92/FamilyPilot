import { Pressable, StyleSheet, View } from 'react-native';

import { Chip, InkSwitch, SMALL_CHIP_GAP, Text, TimeField } from '@/src/components/ui';
import { FadeInView } from '@/src/components/ui/FadeInView';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import {
  DraftChild,
  DraftNap,
  FEED_INTERVAL_HOURS,
  MAX_FEED_TIMES,
  MAX_NAPS,
  NAP_LENGTHS,
  FeedMode,
  newNap,
} from '@/src/utils/onboarding-draft';
import { expandFeedInterval } from '@/src/utils/routine-schedule';

const napLengthLabel = (minutes: number) => (minutes === 60 ? '1 hour' : minutes === 90 ? '1½ hours' : '2 hours');

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <Text variant="body" style={styles.question}>
        {label}
      </Text>
      <InkSwitch accessibilityLabel={label} value={value} onValueChange={onChange} />
    </View>
  );
}

function AddLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.add}>
      <Text variant="link">{label}</Text>
    </Pressable>
  );
}

function Remove({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={12}>
      <Text variant="caption" color={colors.error[500]}>
        Remove
      </Text>
    </Pressable>
  );
}

/** Naps: several a day, each an approximate time and a rough length. */
export function NapEditor({
  name,
  naps,
  onChange,
}: {
  name: string;
  naps: DraftNap[];
  onChange: (next: DraftNap[]) => void;
}) {
  const who = name.trim() || 'your child';
  const update = (id: string, patch: Partial<DraftNap>) =>
    onChange(naps.map((nap) => (nap.id === id ? { ...nap, ...patch } : nap)));

  return (
    <View>
      <Toggle
        label={`Does ${who} usually nap during the day?`}
        value={naps.length > 0}
        onChange={(on) => onChange(on ? [newNap()] : [])}
      />
      {naps.length > 0 ? (
        <FadeInView style={styles.group}>
          {naps.map((nap, index) => (
            <View key={nap.id} style={styles.item}>
              <View style={styles.itemHeader}>
                <Text variant="caption" color={colors.text.secondary}>
                  {naps.length > 1 ? `Nap ${index + 1}` : 'Usually around'}
                </Text>
                {naps.length > 1 ? (
                  <Remove label={`Remove nap ${index + 1}`} onPress={() => onChange(naps.filter((n) => n.id !== nap.id))} />
                ) : null}
              </View>
              <TimeField
                label=""
                value={nap.time}
                onChange={(time) => update(nap.id, { time })}
              />
              <Text variant="caption" color={colors.text.secondary}>
                About how long?
              </Text>
              <View style={styles.chips}>
                {NAP_LENGTHS.map((minutes) => (
                  <Chip
                    key={minutes}
                    size="small"
                    label={napLengthLabel(minutes)}
                    active={nap.durationMinutes === minutes}
                    onPress={() => update(nap.id, { durationMinutes: minutes })}
                  />
                ))}
              </View>
            </View>
          ))}
          {naps.length < MAX_NAPS ? (
            <AddLink label="+ Add another nap" onPress={() => onChange([...naps, newNap()])} />
          ) : null}
        </FadeInView>
      ) : null}
    </View>
  );
}

/** Feeds or meals: fixed times, or "every few hours" from a first one. */
export function FeedEditor({
  name,
  noun,
  draft,
  onChange,
}: {
  name: string;
  noun: 'feed' | 'meal';
  draft: Pick<DraftChild, 'feedMode' | 'feedTimes' | 'feedFirst' | 'feedEveryHours'>;
  onChange: (patch: Partial<Pick<DraftChild, 'feedMode' | 'feedTimes' | 'feedFirst' | 'feedEveryHours'>>) => void;
}) {
  const who = name.trim() || 'your child';
  const on = draft.feedMode !== 'none';
  const setTime = (index: number, value: string) =>
    onChange({ feedTimes: draft.feedTimes.map((t, i) => (i === index ? value : t)) });
  const interval = expandFeedInterval(draft.feedFirst, draft.feedEveryHours * 60);
  const modeChip = (mode: Exclude<FeedMode, 'none'>, label: string) => (
    <Chip size="small" label={label} active={draft.feedMode === mode} onPress={() => onChange({ feedMode: mode })} />
  );

  return (
    <View>
      <Toggle
        label={`Does ${who} have ${noun === 'feed' ? 'feeds' : 'meals'} at set times?`}
        value={on}
        onChange={(next) =>
          onChange(
            next
              ? noun === 'feed'
                ? { feedMode: 'interval', feedFirst: draft.feedFirst || '07:00' }
                : { feedMode: 'times', feedTimes: draft.feedTimes.length ? draft.feedTimes : ['12:00'] }
              : { feedMode: 'none' },
          )
        }
      />
      {on ? (
        <FadeInView style={styles.group}>
          <View style={styles.chips}>
            {modeChip('times', 'At set times')}
            {modeChip('interval', 'Every few hours')}
          </View>

          {draft.feedMode === 'times' ? (
            <View style={styles.group}>
              {(draft.feedTimes.length ? draft.feedTimes : ['12:00']).map((time, index, all) => (
                <View key={index} style={styles.item}>
                  <View style={styles.itemHeader}>
                    <Text variant="caption" color={colors.text.secondary}>
                      {all.length > 1 ? `${noun === 'feed' ? 'Feed' : 'Meal'} ${index + 1}` : 'Usually around'}
                    </Text>
                    {all.length > 1 ? (
                      <Remove
                        label={`Remove ${noun} ${index + 1}`}
                        onPress={() => onChange({ feedTimes: all.filter((_, i) => i !== index) })}
                      />
                    ) : null}
                  </View>
                  <TimeField label="" value={time} onChange={(value) => setTime(index, value)} />
                </View>
              ))}
              {draft.feedTimes.length < MAX_FEED_TIMES ? (
                <AddLink
                  label={`+ Add another ${noun}`}
                  onPress={() => onChange({ feedTimes: [...(draft.feedTimes.length ? draft.feedTimes : ['12:00']), '15:00'] })}
                />
              ) : null}
            </View>
          ) : (
            <View style={styles.group}>
              <TimeField label={`First ${noun} of the day`} value={draft.feedFirst} onChange={(feedFirst) => onChange({ feedFirst })} />
              <Text variant="caption" color={colors.text.secondary}>
                How often?
              </Text>
              <View style={styles.chips}>
                {FEED_INTERVAL_HOURS.map((hours) => (
                  <Chip
                    key={hours}
                    size="small"
                    label={`Every ${hours} hours`}
                    active={draft.feedEveryHours === hours}
                    onPress={() => onChange({ feedEveryHours: hours })}
                  />
                ))}
              </View>
              {interval.length > 0 ? (
                <Text variant="caption" color={colors.text.secondary}>
                  {interval.join(', ')}
                </Text>
              ) : null}
            </View>
          )}
        </FadeInView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  question: { flex: 1, fontWeight: '600' },
  group: { marginTop: spacing.md, gap: spacing.md },
  item: {
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.background,
    borderRadius: radius.md,
  },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SMALL_CHIP_GAP },
  add: { minHeight: 44, justifyContent: 'center' },
});
