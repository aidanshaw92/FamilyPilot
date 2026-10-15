import { ScrollView, StyleSheet, View } from 'react-native';

import { BottomSheet, Button, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import type { Proposal } from '@/src/services/saved/reconnect';
import type { SuccessorLookup } from '@/src/services/saved/reconnect-lookup';
import type { SavedItem, Venue } from '@/src/types';
import { formatCategory } from '@/src/utils/format-category';

/**
 * "Is this the same place?": the only place a saved place is ever pointed at a new listing, and only on a tap.
 *
 * Principles, in the order a parent meets them: it never chooses for them; it can always be left with "none of these" and then nothing has changed;
 * several look-alikes are all shown, with a plain note, rather than the best guess being promoted; and when no successor exists it says so and offers only
 * what the parent can already do (keep the saved copy, or remove it, which is its own tap). The words are a parent's words: no "migration", no "alias",
 * and no blame ("has a new listing", not "is broken").
 */
export interface ReconnectSheetProps {
  visible: boolean;
  onClose: () => void;
  saved: SavedItem;
  lookup: Extract<SuccessorLookup, { status: 'relisted' | 'gone' }>;
  onConfirm: (venue: Venue) => void;
  onRemove: () => void;
}

const metresLabel = (metres: number) => (metres < 50 ? 'in the same spot' : `${Math.round(metres / 10) * 10} m from where you saved it`);

function Candidate({ proposal, saved, onConfirm }: { proposal: Proposal; saved: SavedItem; onConfirm: (venue: Venue) => void }) {
  const { venue } = proposal;
  return (
    <View style={styles.candidate} testID={`reconnect-candidate-${venue.id}`}>
      <Text variant="heading3" numberOfLines={2}>{venue.name}</Text>
      <Text variant="caption" color={colors.text.secondary}>
        {formatCategory(venue.category)} · {metresLabel(proposal.metres)} · {proposal.reasons[0]}
      </Text>
      <Button
        label="Yes, this one"
        variant="outline"
        size="md"
        accessibilityLabel={`Yes, ${venue.name} is the same place as ${saved.venue.name}`}
        onPress={() => onConfirm(venue)}
        testID={`reconnect-confirm-${venue.id}`}
      />
    </View>
  );
}

export function ReconnectSheet({ visible, onClose, saved, lookup, onConfirm, onRemove }: ReconnectSheetProps) {
  const relisted = lookup.status === 'relisted';
  return (
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel={relisted ? 'Is this the same place?' : 'This place is no longer listed'} testID="reconnect-sheet">
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text variant="heading2" accessibilityRole="header">{relisted ? 'Is this the same place?' : 'We can’t find this place now'}</Text>
        <Text variant="body" color={colors.text.secondary}>
          You saved <Text variant="body" style={styles.strong}>{saved.venue.name}</Text> ({formatCategory(saved.venue.category)}).
        </Text>

        {lookup.status === 'relisted' ? (
          <>
            {lookup.proposals.ambiguous ? (
              <Text variant="bodySmall" color={colors.text.secondary} testID="reconnect-ambiguous">
                More than one place looks like this one. Choose the one you mean, or none of them.
              </Text>
            ) : null}
            <View style={styles.list}>
              {lookup.proposals.proposals.map((proposal) => (
                <Candidate key={proposal.venue.id} proposal={proposal} saved={saved} onConfirm={onConfirm} />
              ))}
            </View>
            <Button label="None of these, keep it as it is" variant="ghost" onPress={onClose} testID="reconnect-decline" />
          </>
        ) : (
          <>
            <Text variant="body" color={colors.text.secondary} testID="reconnect-gone">
              It isn’t in today’s listings, so it can’t be opened from here. Your saved copy stays as it is, and so do plans you have already made.
            </Text>
            <View style={styles.actions}>
              <Button label="Keep it" variant="outline" onPress={onClose} testID="reconnect-keep" />
              <Button label="Remove from saved" variant="ghost" onPress={onRemove} testID="reconnect-remove" accessibilityLabel={`Remove ${saved.venue.name} from saved`} />
            </View>
          </>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.screenPadding, paddingTop: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  strong: { fontFamily: 'Inter_600SemiBold' },
  list: { gap: spacing.md },
  candidate: { gap: spacing.xs, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  actions: { gap: spacing.sm },
});
