import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Field, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { PlanningFamily } from '@/src/services/planning/planner';
import { locateArea } from '@/src/services/planning/recommendations';
import { usePlanningStore } from '@/src/stores/planning-store';

/**
 * Another family, from a name and a postcode: all a plan or a Meet halfway needs to start.
 *
 * Deliberately thin. It records where the family leaves from and what to call them, and nothing else: no children,
 * no routines, no travel limit. Those are theirs to share through a connection, so with only a postcode FamilyPilot does
 * not pretend to know them: the planner treats the family as "starting point only" and the screens say so.
 *
 * It lives inline, where the parent already is. Sending them away to a separate Families screen to add somebody and then
 * back again was one of the ways the planning journey fell in two.
 *
 * The postcode is resolved by the existing free lookup (`/api/planning/location`), the same one the profile uses.
 */

export function AddFamilyByPostcode({
  onAdded,
  onCancel,
}: {
  /** The planning-family id, so the caller can select it. */
  onAdded: (family: PlanningFamily) => void;
  onCancel?: () => void;
}) {
  const setFamily = usePlanningStore((s) => s.setFamily);
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (busy) return;
    const label = name.trim();
    if (!label) {
      setError('Add a first name so you can tell them apart.');
      return;
    }
    if (!area.trim()) {
      setError('Add a postcode or town for where they set off from.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const located = await locateArea(area.trim());
      const family: PlanningFamily = {
        id: `guest-${Date.now().toString(36)}`,
        label,
        area: located.area,
        latitude: located.latitude,
        longitude: located.longitude,
        // Not known, so not entered: no children, no must-haves, no routines.
        ages: [],
        // Not known, so not entered: another family's limit and budget are theirs to state, never ours to assume.
        pushchair: false,
        required: [],
        routines: [],
      };
      setFamily(family);
      onAdded(family);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not find that postcode.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.panel} testID="add-family-by-postcode">
      <Text variant="label">Add a family by postcode</Text>
      <Text variant="caption" color={colors.text.secondary}>
        Just their first name and where they set off from. They’ll show as “Hannah’s family”. We won’t guess anything else about them.
      </Text>
      <Field label="Their first name" value={name} onChange={setName} placeholder="Hannah" testID="add-family-name" />
      <Field label="Postcode or town" value={area} onChange={setArea} placeholder="NW5 1TL" testID="add-family-area" />
      {error ? (
        <Text variant="caption" color={colors.error[600]} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Button label={busy ? 'Finding…' : 'Add family'} disabled={busy} onPress={() => void save()} testID="add-family-save" />
      {onCancel ? <Button label="Cancel" variant="ghost" size="sm" onPress={onCancel} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
