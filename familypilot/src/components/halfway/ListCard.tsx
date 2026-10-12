import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Text } from '@/src/components/ui';
import { Button } from '@/src/components/ui';
import { VenueImage } from '@/src/components/ui/VenueImage';
import { colors, fontFamily, radius, shadows, spacing } from '@/src/design-system/tokens';
import { HalfwayOption } from '@/src/services/planning/meet-halfway';
import { journeyBars, journeysKnown, listCardMeta, missingJourneyNotice, shortFamilyName } from '@/src/services/planning/halfway-view';

import { FitChip, OTHER_TONE } from './parts';

/** From this system font scale up, the card reflows to one column: a wide photo, the lines stacked, the action inside it. */
export const LARGE_TEXT_SCALE = 1.35;

/**
 * One place in the list: a number that is its pin, its photo (or the labelled illustration), its name, what is left to check,
 * each family's journey and each family's Family Fit. Tapping it selects the place and shows it on the map.
 */
export function HalfwayListCard({
  option,
  index,
  otherLabel,
  selected,
  onSelect,
  onPlan,
}: {
  option: HalfwayOption;
  index: number;
  otherLabel: string;
  selected: boolean;
  onSelect: () => void;
  onPlan: () => void;
}) {
  const { fontScale } = useWindowDimensions();
  const large = fontScale >= LARGE_TEXT_SCALE;
  const bars = journeyBars(option.journeys);
  const notice = journeysKnown(option) ? null : missingJourneyNotice(option);
  const spoken = [
    `${index + 1}. ${option.venue.name}`,
    listCardMeta(option),
    bars.map((bar) => `${bar.who} ${bar.time}`).join(', '),
    `You: ${option.fits.mine.label}`,
    `${shortFamilyName(otherLabel)}: ${option.fits.other.label}`,
    selected ? 'Selected, shown on the map' : 'Show on the map',
  ].join('. ');

  const number = (
    <View style={styles.number}>
      <Text style={styles.numberText}>{String(index + 1)}</Text>
    </View>
  );
  const journeys = (
    <View style={large ? styles.journeysStacked : styles.journeysInline}>
      {bars.map((bar) => (
        <View key={bar.journey.familyId} style={styles.journeyItem}>
          <View style={[styles.dot, { backgroundColor: bar.journey.role === 'mine' ? colors.action : OTHER_TONE }]} />
          <Text style={[styles.journeyText, bar.missing && styles.journeyMissing]}>
            {large ? `${bar.who}  ${bar.time}` : bar.time}
          </Text>
        </View>
      ))}
    </View>
  );
  const chips = (
    <View style={styles.chips}>
      <FitChip role="mine" label="" fit={option.fits.mine} />
      <FitChip role="other" label={otherLabel} fit={option.fits.other} />
    </View>
  );

  return (
    <View style={[styles.card, selected && styles.cardSelected]} testID="halfway-option">
      <Pressable
        onPress={onSelect}
        accessibilityRole="button"
        accessibilityLabel={spoken}
        accessibilityState={{ selected }}
        style={large ? styles.bodyLarge : styles.body}
        testID="halfway-option-head"
      >
        <View style={large ? styles.photoLarge : styles.photo}>
          <VenueImage uri={option.venue.imageUrl} category={option.venue.category} alt={option.venue.name} style={styles.fillImage} borderRadius={radius.lg} />
          <View style={styles.numberAnchor} pointerEvents="none">{number}</View>
        </View>
        <View style={styles.text}>
          <Text style={styles.name} numberOfLines={large ? 5 : 3}>{option.venue.name}</Text>
          <Text style={styles.meta}>{listCardMeta(option)}</Text>
          {journeys}
          {chips}
        </View>
      </Pressable>
      {notice ? <Notice title={notice.title} body={notice.body} /> : null}
      {large ? <Button label="Plan this day" onPress={onPlan} testID="halfway-plan" /> : null}
    </View>
  );
}

/** A quiet notice under a card: what could not be worked out, in a parent's words. */
function Notice({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.notice}>
      <Ionicons name="information-circle-outline" size={18} color={colors.text.secondary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.noticeTitle}>{title}</Text>
        <Text style={styles.noticeBody}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 12, gap: 10, borderWidth: 2, borderColor: 'transparent', ...shadows.card },
  cardSelected: { borderColor: colors.action },
  body: { flexDirection: 'row', gap: 12 },
  bodyLarge: { gap: 12 },
  photo: { width: 88, alignSelf: 'stretch', minHeight: 100, borderRadius: radius.lg, overflow: 'hidden' },
  photoLarge: { height: 124, borderRadius: radius.lg, overflow: 'hidden' },
  fillImage: { width: '100%', height: '100%' },
  numberAnchor: { position: 'absolute', left: 6, top: 6 },
  number: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.action, alignItems: 'center', justifyContent: 'center' },
  numberText: { fontFamily: fontFamily.bold, fontSize: 12, lineHeight: 15, color: colors.action },
  text: { flex: 1, gap: 4 },
  name: { fontFamily: fontFamily.bold, fontSize: 17, lineHeight: 22, color: colors.ink },
  meta: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 17, color: colors.text.secondary },
  journeysInline: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 2 },
  journeysStacked: { gap: 4 },
  journeyItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  journeyText: { fontFamily: fontFamily.bold, fontSize: 13, lineHeight: 17, color: colors.ink },
  journeyMissing: { fontFamily: fontFamily.regular, color: colors.text.secondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  notice: { flexDirection: 'row', gap: 8, backgroundColor: colors.fill, borderRadius: radius.lg, padding: 12 },
  noticeTitle: { fontFamily: fontFamily.bold, fontSize: 13, lineHeight: 18, color: colors.text.secondary },
  noticeBody: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 18, color: colors.ink },
});
