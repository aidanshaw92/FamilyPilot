import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/src/components/ui/Button';
import { Text } from '@/src/components/ui/Text';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import {
  BackupOutcome,
  RestoreOutcome,
  StoredBackupSummary,
  backUpSavedPlaces,
  readBackupSummary,
  restoreSavedPlaces,
} from '@/src/services/saved/saved-backup';
import { isSupabaseConfigured } from '@/src/services/supabase/client';
import { useSavedStore } from '@/src/stores/saved-store';

/**
 * The opt-in control for putting Saved places somewhere other than this phone.
 *
 * TWO BUTTONS, AND THEY SAY WHAT THEY DO. Not a toggle called "sync", because this is not sync: it adds
 * on restore and never removes, so a place un-saved on another device comes back. Calling that "sync"
 * would set an expectation the code does not meet, and a parent would discover the difference by losing
 * track of what they had removed. The copy below says it in a sentence instead.
 *
 * It renders nothing at all when there are no saved places. An empty Saved screen offering to back up
 * nothing is noise, and the screen's own empty state is the thing worth reading there.
 */
export function SavedBackupPanel() {
  const items = useSavedStore((state) => state.items);
  const savedIds = useSavedStore((state) => state.savedIds);
  const restoreSaved = useSavedStore((state) => state.restoreSaved);

  const [busy, setBusy] = useState<null | 'backup' | 'restore'>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<'neutral' | 'good' | 'bad'>('neutral');
  const [stored, setStored] = useState<StoredBackupSummary | null>(null);

  const refreshSummary = useCallback(() => {
    // Best effort and silent. Failing to read the summary is not worth a message: the buttons still
    // work and they report their own outcome.
    void readBackupSummary().then(setStored).catch(() => setStored(null));
  }, []);

  useEffect(refreshSummary, [refreshSummary]);

  const say = (text: string, next: 'neutral' | 'good' | 'bad') => {
    setMessage(text);
    setTone(next);
  };

  /** Every outcome is named. A silent success is indistinguishable from a button that does nothing. */
  const reportBackup = (outcome: BackupOutcome) => {
    if (outcome.state === 'backed-up') {
      const extra = outcome.truncatedAt
        ? ` Only the first ${outcome.truncatedAt} were included.`
        : outcome.idsWithoutSnapshot > 0
          ? ` ${outcome.idsWithoutSnapshot} could not be included because this device has no details for them.`
          : '';
      say(`Backed up ${outcome.items} saved ${outcome.items === 1 ? 'place' : 'places'}.${extra}`, 'good');
      refreshSummary();
      return;
    }
    say(outcome.reason, outcome.state === 'failed' ? 'bad' : 'neutral');
  };

  const reportRestore = (outcome: RestoreOutcome) => {
    if (outcome.state === 'restored') {
      if (outcome.added === 0 && outcome.alreadyHere > 0) {
        say(`Nothing to add: all ${outcome.alreadyHere} places in your backup are already on this device.`, 'neutral');
      } else if (outcome.added === 0) {
        say('Your backup is empty, so nothing was added.', 'neutral');
      } else {
        say(
          `Added ${outcome.added} ${outcome.added === 1 ? 'place' : 'places'} from your backup.` +
            (outcome.alreadyHere > 0 ? ` ${outcome.alreadyHere} were already here and were left as they are.` : ''),
          'good',
        );
      }
      return;
    }
    say(outcome.reason, outcome.state === 'failed' || outcome.state === 'unreadable' ? 'bad' : 'neutral');
  };

  const onBackUp = async () => {
    setBusy('backup');
    try {
      reportBackup(await backUpSavedPlaces(savedIds, items));
    } finally {
      setBusy(null);
    }
  };

  const onRestore = async () => {
    setBusy('restore');
    try {
      // `restoreSaved` adds or replaces one item. Restore is handed only this, and no remover, so it
      // has no way to delete a saved place even if a later edit tried to.
      reportRestore(await restoreSavedPlaces(items, restoreSaved));
    } finally {
      setBusy(null);
    }
  };

  // Nothing saved and nothing stored: there is no useful action to offer yet.
  if (items.length === 0 && !stored) return null;

  if (!isSupabaseConfigured) {
    // Said plainly rather than hidden, so a parent who expected this feature knows it is the app's
    // configuration and not something they did.
    return (
      <View style={styles.card}>
        <Text variant="caption" color={colors.text.secondary}>
          Saving your places to an account is not switched on in this build, so they stay on this device.
        </Text>
      </View>
    );
  }

  const messageColor = tone === 'bad' ? colors.error[500] : colors.text.secondary;

  return (
    <View style={styles.card}>
      <Text variant="heading3">Keep your saved places</Text>
      <Text variant="caption" color={colors.text.secondary} style={styles.blurb}>
        Saved places live on this device. Back them up to your account to get them onto another phone, or
        after reinstalling. Nothing is uploaded unless you press Back up.
      </Text>
      <Text variant="caption" color={colors.text.tertiary} style={styles.blurb}>
        Restoring adds places you are missing. It never deletes anything, so a place you removed on
        another device will come back.
      </Text>

      {stored ? (
        <Text variant="caption" color={colors.text.tertiary} style={styles.blurb}>
          Last backup: {stored.items} {stored.items === 1 ? 'place' : 'places'}, {formatWhen(stored.updatedAt)}.
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Button
          label={busy === 'backup' ? 'Backing up...' : 'Back up'}
          onPress={() => void onBackUp()}
          disabled={busy !== null || items.length === 0}
          style={styles.action}
        />
        {/* `outline`, not `secondary`. The secondary token is a solid green fill, which would give
            Restore the same visual weight as Back up -- wrong for the rarer action, and the one whose
            behaviour (adds, never removes) is the more surprising of the two. */}
        <Button
          label={busy === 'restore' ? 'Restoring...' : 'Restore'}
          variant="outline"
          onPress={() => void onRestore()}
          disabled={busy !== null}
          style={styles.action}
        />
      </View>

      {message ? (
        <Text variant="caption" color={messageColor} style={styles.message}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

/** A date a parent can read, degrading to the raw value rather than throwing on something unparseable. */
function formatWhen(iso: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return 'at an unknown time';
  const date = new Date(parsed);
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  blurb: { marginTop: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  action: { flex: 1 },
  message: { marginTop: spacing.sm },
});
