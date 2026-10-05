import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { colors, spacing } from '@/src/design-system/tokens';
import { FamilyProfile, VenueDetail } from '@/src/types';
import { relevanceFor } from '@/src/services/planning/visit-questions';
import { familyEssentialRows } from '@/src/utils/family-essentials';

/**
 * Frame 02's "Family essentials": label left in Medium 14.5 ink, value right in Regular 14, hairline between rows,
 * 48 tall. What is CONFIRMED is listed as rows. What is not is said once, in one quiet line with a way to help, rather
 * than as a column of repeated "Not confirmed" rows that bury the facts that are known (a venue with two confirmed
 * facts and six unknown ones read as a page of "Not confirmed"). Unknown stays unknown: it is never turned into "no".
 *
 * An unknown is mentioned only if it could matter to THIS family (buggy access for a family with a buggy, baby
 * changing for a family with a child under four); the rest stay unknown and unmentioned on this line.
 *
 * Opening hours are not here: they are answered under "Today", where the useful current state leads.
 */
export function FamilyEssentials({ venue, profile = null, onHelpCheck }: { venue: VenueDetail; profile?: FamilyProfile | null; onHelpCheck?: () => void }) {
  const rows = familyEssentialRows(venue).filter((row) => row.key !== 'hours');
  const confirmed = rows.filter((row) => row.confirmed);
  // An unknown that this family cannot be affected by is not worth a line here: no buggy, no buggy-access worry; no
  // child under four, no baby-changing worry. It is still on the page, under "How we know this".
  const irrelevant = (key: string) => (key === 'buggy' ? relevanceFor('pushchair', profile) === 0 : key === 'baby-changing' ? relevanceFor('babyChanging', profile) === 0 : false);
  const unknown = rows.filter((row) => !row.confirmed && !irrelevant(row.key));

  return (
    <View testID="family-essentials">
      {confirmed.map((item, index) => (
        <View key={item.key} style={[styles.row, index === confirmed.length - 1 && unknown.length === 0 && styles.last]}>
          <Text style={styles.label}>{item.label}</Text>
          <Text style={[styles.value, styles.confirmed]} numberOfLines={3}>
            {item.value}
          </Text>
        </View>
      ))}
      {unknown.length > 0 ? (
        <View style={styles.unknown} testID="essentials-unconfirmed">
          <Text style={styles.unknownText}>
            {confirmed.length === 0 ? 'Not confirmed yet: ' : 'Still to be confirmed: '}
            {unknown.map((item) => item.label.toLowerCase()).join(', ')}.
          </Text>
          {onHelpCheck ? (
            <Pressable
              onPress={onHelpCheck}
              accessibilityRole="button"
              accessibilityLabel="Help check these details if you have visited"
              hitSlop={8}
              style={styles.help}
            >
              <Text variant="link">Been here? Help check</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  last: { borderBottomWidth: 0 },
  label: { fontFamily: 'Inter_500Medium', fontSize: 14.5, lineHeight: 18, color: colors.ink },
  value: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 18, textAlign: 'right' },
  confirmed: { color: colors.text.secondary },
  unknown: { paddingTop: spacing.md, gap: spacing.xs },
  unknownText: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20, color: colors.text.tertiary },
  help: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
});
