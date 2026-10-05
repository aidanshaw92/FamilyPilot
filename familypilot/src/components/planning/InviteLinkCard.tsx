import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { InviteRelationship, inviteShareMessage } from '@/src/services/planning/invite-links';
import { copyText, shareInvite } from '@/src/services/planning/share-invite';

/**
 * A ready invitation link: shown as text that can be selected, with Share and Copy, and the plain terms of the link
 * (single use, seven days, what accepting shares). Used by the onboarding invite step, the Add another family panel and
 * the Families screen, so the link looks and behaves the same everywhere.
 */
export function InviteLinkCard({
  url,
  relationship,
  inviterFirstName,
}: {
  url: string;
  relationship: InviteRelationship;
  inviterFirstName?: string;
}) {
  const [note, setNote] = useState('');

  return (
    <View style={styles.box} testID="invite-link-card">
      <Text variant="label">Your invitation link</Text>
      <Text variant="bodySmall" selectable style={styles.link} testID="invite-link-text">
        {url}
      </Text>
      <View style={styles.actions}>
        <Button
          label="Share link"
          size="sm"
          onPress={() =>
            void shareInvite(inviteShareMessage(url, relationship, inviterFirstName), url).then((outcome) =>
              setNote(outcome === 'copied' ? 'Link copied. Paste it into a message.' : outcome === 'failed' ? '' : 'Shared.'),
            )
          }
          testID="invite-share"
        />
        <Button
          label="Copy link"
          variant="outline"
          size="sm"
          onPress={() => void copyText(url).then((ok) => setNote(ok ? 'Link copied.' : 'Select the link above to copy it.'))}
          testID="invite-copy"
        />
      </View>
      {note ? (
        <Text variant="caption" color={colors.secondary[600]} accessibilityRole="alert">
          {note}
        </Text>
      ) : null}
      <Text variant="caption" color={colors.text.secondary}>
        Works once and expires in 7 days. When they accept, you share your family’s first name, your area (to about a
        kilometre), your children’s ages and your preferences. Never names, birthdays or your address.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm, backgroundColor: colors.fill, borderRadius: radius.lg, padding: spacing.lg },
  link: { color: colors.text.secondary, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
});
