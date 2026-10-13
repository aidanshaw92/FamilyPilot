import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui';
import { colors, fontFamily, radius, spacing } from '@/src/design-system/tokens';
import { MatchLine } from '@/src/services/matching/family-match';
import { HalfwayFit, HalfwayOption } from '@/src/services/planning/meet-halfway';
import { chipName, journeyBars, shortFamilyName, journeysKnown, journeysUneven, otherFitProvenance } from '@/src/services/planning/halfway-view';

/** The other family's colour on the map and everywhere it is named: the rose of the design system's other-family areas. */
export const OTHER_TONE = '#B0507E';

/** "● You  Good fit": one family's grade. The dot is that family's colour, the same as its area on the map. */
export function FitChip({ role, label, fit, size = 'default' }: { role: 'mine' | 'other'; label: string; fit: HalfwayFit; size?: 'default' | 'small' }) {
  const tone = tones(fit);
  const name = chipName(role, label);
  return (
    <View
      style={[styles.chip, size === 'small' && styles.chipSmall, { backgroundColor: tone.bg }]}
      accessible
      accessibilityLabel={`${role === 'mine' ? 'Your family' : name}: ${fit.label}`}
      testID={`halfway-fit-${role}`}
    >
      <View style={[styles.dot, { backgroundColor: role === 'mine' ? colors.action : OTHER_TONE }]} />
      <Text style={[styles.chipName, { color: colors.ink }]} numberOfLines={1}>{name}</Text>
      <Text style={[styles.chipGrade, { color: tone.fg }]} numberOfLines={1}>{fit.label}</Text>
    </View>
  );
}

function tones(fit: HalfwayFit): { bg: string; fg: string } {
  switch (fit.verdict) {
    case 'excellent':
    case 'good':
      return fit.qualified ? { bg: colors.fill, fg: colors.text.secondary } : { bg: colors.actionSoft, fg: colors.action };
    case 'possible':
      return { bg: colors.warning[50], fg: colors.warning[600] };
    case 'poor':
      return { bg: colors.error[50], fg: colors.error[600] };
    default:
      return { bg: colors.fill, fg: colors.text.secondary };
  }
}

/** The engine's own label as a soft amber pill ("Promising option · 2 things to check"), or mint where it is a supported claim. */
export function LabelPill({ text, supported }: { text: string; supported: boolean }) {
  return (
    <View style={[styles.pill, supported ? { backgroundColor: colors.actionSoft } : { backgroundColor: colors.warning[50] }]} testID="halfway-option-label">
      <Text style={[styles.pillText, { color: supported ? colors.action : colors.warning[600] }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

/**
 * Each family's estimated one-way journey as bars proportional to each other, then the engine's fairness sentence. The time
 * is "about N min" because it is an estimate from distance; there is no route, so no line and no road is implied.
 */
export function JourneyComparison({ option, heading = false, dense = false }: { option: HalfwayOption; heading?: boolean; dense?: boolean }) {
  const bars = journeyBars(option.journeys);
  const uneven = journeysUneven(option);
  const known = journeysKnown(option);
  return (
    <View style={styles.journeys} testID="halfway-journeys">
      {heading ? <Text variant="heading3" accessibilityRole="header">Journeys</Text> : null}
      {dense ? (
        // A short phone has no room for the bars under the map: the same two estimates on one line each pair, same words.
        <View style={styles.denseRow}>
          {bars.map(({ journey, time, who, missing }) => (
            <View key={journey.familyId} style={styles.denseItem} accessible accessibilityLabel={`${who}: ${time}`}>
              <View style={[styles.dot, { backgroundColor: journey.role === 'mine' ? colors.action : OTHER_TONE }]} />
              <Text style={[styles.denseText, missing && styles.journeyTimeMissing]} numberOfLines={1}>{`${journey.role === 'mine' ? 'You' : shortFamilyName(journey.label)} ${time}`}</Text>
            </View>
          ))}
        </View>
      ) : bars.map(({ journey, share, time, who, missing }) => (
        <View key={journey.familyId} style={styles.journeyRow} accessible accessibilityLabel={`${who}: ${time}`}>
          <Text style={styles.journeyWho} numberOfLines={1}>{who}</Text>
          <View style={[styles.track, missing && styles.trackMissing]}>
            {missing ? null : <View style={[styles.fill, { width: `${share * 100}%`, backgroundColor: journey.role === 'mine' ? colors.action : OTHER_TONE }]} />}
          </View>
          <Text style={[styles.journeyTime, missing && styles.journeyTimeMissing]}>{time}</Text>
        </View>
      ))}
      <View style={styles.fairness} testID="halfway-fairness">
        <Ionicons name={known ? (uneven ? 'alert-circle-outline' : 'scale-outline') : 'information-circle-outline'} size={16} color={known ? (uneven ? colors.warning[600] : colors.action) : colors.text.secondary} />
        <Text style={[styles.fairnessText, known && uneven && { color: colors.warning[600] }]}>{known ? option.fairness : 'We can’t compare the journeys yet'}</Text>
      </View>
    </View>
  );
}

/** "3 of 7 details confirmed": segments for what has been checked at this place, beside the grade and never part of it. */
export function EvidenceMeter({ known, total }: { known: number; total: number }) {
  if (total <= 0) return null;
  return (
    <View style={styles.meterRow} accessible accessibilityLabel={`${known} of ${total} details confirmed`} testID="halfway-evidence-meter">
      <View style={styles.segments}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[styles.segment, i < known ? styles.segmentOn : styles.segmentOff]} />
        ))}
      </View>
      <Text variant="caption" color={colors.text.secondary}>{`${known} of ${total} details confirmed`}</Text>
    </View>
  );
}

/** One line of Family Fit: ✓ confirmed, bulb reasonable to expect, ? not checked yet, (i) a fact that is not a mark against. */
function EvidenceRow({ icon, tint, text, quiet = false, testID }: { icon: keyof typeof Ionicons.glyphMap; tint: string; text: string; quiet?: boolean; testID?: string }) {
  return (
    <View style={styles.evidenceRow} testID={testID}>
      <Ionicons name={icon} size={18} color={tint} style={styles.evidenceIcon} />
      <Text style={[styles.evidenceText, quiet && { color: colors.text.secondary }]}>{text}</Text>
    </View>
  );
}

export function EvidenceLegend() {
  return (
    <View style={styles.legend} accessible accessibilityLabel="Key: a tick is confirmed, a bulb is reasonable to expect, a question mark is not checked yet">
      <View style={styles.legendItem}><Ionicons name="checkmark" size={13} color={colors.secondary[500]} /><Text style={styles.legendText}>Confirmed</Text></View>
      <View style={styles.legendItem}><Ionicons name="bulb-outline" size={13} color={colors.warning[600]} /><Text style={styles.legendText}>Reasonable to expect</Text></View>
      <View style={styles.legendItem}><Ionicons name="help-circle-outline" size={13} color={colors.text.tertiary} /><Text style={styles.legendText}>Not checked yet</Text></View>
    </View>
  );
}

const MAX_LINES = 8;

/** Your family's Family Fit in full: headline, then what is confirmed, what is only reasonable to expect and what is not checked yet. */
export function FamilyFitMine({ option }: { option: HalfwayOption }) {
  const fit = option.fits.mine;
  const match = option.venue.familyMatch;
  const lines: { key: string; line: MatchLine; kind: 'confirmed' | 'expected' | 'caution' | 'note' | 'unknown' }[] = [];
  if (match) {
    for (const line of match.reasons) lines.push({ key: `r-${line.key}`, line, kind: line.inferred ? 'expected' : 'confirmed' });
    for (const line of match.cautions) lines.push({ key: `c-${line.key}`, line, kind: line.note ? 'note' : 'caution' });
    for (const line of match.toCheck) lines.push({ key: `t-${line.key}`, line, kind: 'unknown' });
  }
  const evidence = fit.evidence;
  return (
    <View style={styles.fitCard} testID="halfway-fit-mine-card">
      <FitChip role="mine" label="" fit={fit} />
      <Text style={styles.fitHeadline}>{match ? match.headline.replace(/ today$/, '') : 'Not assessed'}</Text>
      {lines.slice(0, MAX_LINES).map(({ key, line, kind }) => (
        <EvidenceRow
          key={key}
          icon={kind === 'confirmed' ? 'checkmark' : kind === 'expected' ? 'bulb-outline' : kind === 'caution' ? 'alert-circle-outline' : kind === 'note' ? 'information-circle-outline' : 'help-circle-outline'}
          tint={kind === 'confirmed' ? colors.secondary[500] : kind === 'expected' ? colors.warning[600] : kind === 'caution' ? colors.warning[600] : colors.text.tertiary}
          text={line.text}
          quiet={kind === 'unknown' || kind === 'note'}
          testID={`halfway-fit-line-${kind}`}
        />
      ))}
      {evidence && evidence.total > 0 ? (
        <>
          <EvidenceMeter known={evidence.known} total={evidence.total} />
          {evidence.missing.length > 0 ? (
            <Text variant="caption" color={colors.text.secondary} testID="halfway-evidence-missing">{`Not yet: ${evidence.missing.join(', ')}`}</Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/**
 * The other family's grade, and nothing about them. Computed only from what their connection shared, shown as a grade with a
 * generic line saying so: no child, age, need, pushchair, routine or checklist, and nothing about what they did not share.
 */
export function FamilyFitOther({ option, label }: { option: HalfwayOption; label: string }) {
  const fit = option.fits.other;
  const words = otherFitProvenance(fit, label);
  return (
    <View style={styles.fitCard} testID="halfway-fit-other-card">
      <FitChip role="other" label={label} fit={fit} />
      <Text style={styles.fitHeadline}>{words.headline}</Text>
      <Text variant="bodySmall" color={colors.text.secondary} testID="halfway-fit-other-provenance">{words.note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { height: 28, borderRadius: radius.full, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingHorizontal: 10 },
  chipSmall: { height: 28, paddingHorizontal: 9 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chipName: { fontFamily: fontFamily.bold, fontSize: 12, lineHeight: 16 },
  chipGrade: { fontFamily: fontFamily.medium, fontSize: 12, lineHeight: 16, flexShrink: 1 },
  pill: { height: 24, borderRadius: radius.full, paddingHorizontal: 10, justifyContent: 'center', alignSelf: 'flex-start', flexShrink: 1 },
  pillText: { fontFamily: fontFamily.semiBold, fontSize: 12, lineHeight: 15 },
  journeys: { gap: 6 },
  denseRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 2 },
  denseItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  denseText: { fontFamily: fontFamily.bold, fontSize: 13, lineHeight: 17, color: colors.ink },
  journeyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 20 },
  journeyWho: { width: 88, fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 16, color: colors.text.secondary },
  track: { flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.fill, overflow: 'hidden' },
  trackMissing: { backgroundColor: 'transparent', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border },
  fill: { height: '100%', borderRadius: 5 },
  journeyTimeMissing: { fontFamily: fontFamily.regular, color: colors.text.secondary },
  journeyTime: { width: 92, textAlign: 'right', fontFamily: fontFamily.bold, fontSize: 13, lineHeight: 16, color: colors.ink },
  fairness: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fairnessText: { fontFamily: fontFamily.medium, fontSize: 13, lineHeight: 16, color: colors.ink, flexShrink: 1 },
  meterRow: { gap: 6, paddingTop: 2 },
  segments: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 5, borderRadius: 3 },
  segmentOn: { backgroundColor: colors.secondary[500] },
  segmentOff: { backgroundColor: colors.border },
  evidenceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  evidenceIcon: { marginTop: 1 },
  evidenceText: { flex: 1, fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 21, color: colors.ink },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendText: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 16, color: colors.text.secondary },
  fitCard: { backgroundColor: colors.fill, borderRadius: radius.xl, padding: spacing.lg, gap: 10 },
  fitHeadline: { fontFamily: fontFamily.bold, fontSize: 16, lineHeight: 22, color: colors.ink },
});
