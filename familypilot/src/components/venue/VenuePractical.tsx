import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { colors, spacing } from '@/src/design-system/tokens';
import { FamilyProfile, VenueDetail } from '@/src/types';
import { beforeYouGoRows, childProvisionRows } from '@/src/utils/venue-practical';

const MAX_RULES = 6;
const MAX_PROVISION = 5;

const caption = (iso: string | null): string | null => {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(d.getTime())
    ? `Checked ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`
    : null;
};

/**
 * "Before you go" and "For children", under What to know on Venue Detail.
 *
 * Both come from reviewed evidence only: the venue's own rules (a gallery that is closed, pushchairs not allowed in the play
 * areas, a lift out of order) and what its own pages say children of an age can do there. Each row says what it is and when
 * it was checked; a venue with neither shows neither heading, and nothing is ever worded as "no restrictions".
 *
 * Same hairline rows and type as the Family essentials above, so it reads as part of that list rather than a new component.
 */
export function VenuePractical({ venue, profile = null, now }: { venue: VenueDetail; profile?: FamilyProfile | null; now?: Date }) {
  const when = now ?? new Date();
  const rules = beforeYouGoRows(venue.trustedFacts?.rules, profile, when).slice(0, MAX_RULES);
  const provision = childProvisionRows(venue.id, profile, when).slice(0, MAX_PROVISION);
  if (rules.length === 0 && provision.length === 0) return null;

  return (
    <View style={styles.wrap} testID="venue-practical">
      {provision.length > 0 ? (
        <View style={styles.group} testID="venue-for-children">
          <Text variant="eyebrow">FOR CHILDREN</Text>
          {provision.map((row, index) => (
            <View key={row.key} style={[styles.row, index === provision.length - 1 && styles.last]}>
              <Ionicons name="happy-outline" size={18} color={colors.secondary[500]} style={styles.icon} />
              <View style={styles.rowBody}>
                <Text style={styles.text}>
                  {row.label}
                  {row.onSetDays ? ' (on set days)' : ''}
                </Text>
                {row.suits.length > 0 ? (
                  <Text style={styles.caption}>Covers {row.suits.join(' and ')}’s {row.suits.length > 1 ? 'ages' : 'age'}</Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {rules.length > 0 ? (
        <View style={styles.group} testID="venue-before-you-go">
          <Text variant="eyebrow">BEFORE YOU GO</Text>
          {rules.map((row, index) => (
            <View key={row.key} style={[styles.row, index === rules.length - 1 && styles.last]} testID={`venue-rule-${row.key}`}>
              <Ionicons
                name={row.tone === 'important' ? 'alert-circle' : 'information-circle-outline'}
                size={18}
                color={row.tone === 'important' ? colors.warning[600] : colors.text.secondary}
                style={styles.icon}
              />
              <View style={styles.rowBody}>
                <Text style={styles.text}>{row.text}</Text>
                {row.forYou ? <Text style={styles.forYou}>Matters for your family</Text> : null}
                {caption(row.checkedAt) ? <Text style={styles.caption}>{caption(row.checkedAt)}</Text> : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: spacing.lg, gap: spacing.lg },
  group: { gap: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  last: { borderBottomWidth: 0 },
  icon: { marginTop: 1 },
  rowBody: { flex: 1, gap: 2 },
  text: { fontFamily: 'Inter_400Regular', fontSize: 14.5, lineHeight: 21, color: colors.ink },
  forYou: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 18, color: colors.warning[600] },
  caption: { fontFamily: 'Inter_400Regular', fontSize: 12.5, lineHeight: 17, color: colors.text.tertiary },
});
