import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { ScreenContainer } from '@/src/components/shared/ScreenContainer';
import { Button, Card, Text } from '@/src/components/ui';
import { colors, spacing } from '@/src/design-system/tokens';
import { FamilyEditor } from '@/src/components/planning/FamilyEditor';
import { formStyles as s } from '@/src/components/ui';
import { PlanningAccount } from '@/src/components/planning/PlanningAccount';
import { useFamilyStore } from '@/src/stores/family-store';
import { usePlanningStore } from '@/src/stores/planning-store';
import { resolveHomeCoordinates } from '@/src/services/places/geo-utils';
import { PlanningFamily } from '@/src/services/planning/planner';

export default function FamiliesScreen() {
  const state = usePlanningStore();
  const profile = useFamilyStore((x) => x.profile);
  const [editor, setEditor] = useState<PlanningFamily | null>(null);

  const blank = (mine: boolean): PlanningFamily => {
    const home = mine ? resolveHomeCoordinates(profile) : null;
    return {
      id: mine ? 'mine' : `guest-${Date.now()}`,
      label: mine ? 'Our family' : '',
      area: mine ? profile.homeLocation : '',
      latitude: home?.latitude ?? NaN,
      longitude: home?.longitude ?? NaN,
      ages: mine ? profile.members.filter((m) => m.role === 'child').map((m) => m.age) : [],
      maxDriveMinutes: mine ? profile.maxDriveMinutes : 30,
      budgetTier: mine ? profile.budgetTier : 'moderate',
      pushchair: mine ? Boolean(profile.pushchair) : false,
      required: [],
      routines: mine ? (profile.routines ?? []).map((r) => ({ ...r })) : [],
    };
  };

  if (!state.hydrated) {
    return (
      <ScreenContainer>
        <Text>Loading your families…</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={{ padding: spacing.screenPadding, paddingBottom: 120, gap: spacing.md }}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="heading1">Families</Text>
        <Text color={colors.text.secondary}>Your family, and the friends you plan days out with.</Text>
        <Text variant="bodySmall">
          Family details and saved plans stay on this device unless you choose to back them up. Friend
          connections share only the details you explicitly approve.
        </Text>

        {editor ? (
          <FamilyEditor
            key={editor.id}
            initial={editor}
            onCancel={() => setEditor(null)}
            onSave={(f) => {
              state.setFamily(f);
              setEditor(null);
            }}
          />
        ) : null}

        {state.families.map((f) => (
          <Card key={f.id} style={s.panel}>
            <Text variant="heading3">{f.label}</Text>
            <Text>
              {f.area} · {f.ages.length ? `Ages ${f.ages.join(', ')}` : 'Adults only'} · {f.routines.length} routines
            </Text>
            <Button label="Edit family and routines" variant="outline" onPress={() => setEditor(f)} />
            <Button
              label="Remove from this device"
              variant="ghost"
              onPress={() => state.removeFamily(f.id)}
            />
          </Card>
        ))}
        {!state.families.some((f) => f.id === 'mine') ? (
          <Button label="Add your family" onPress={() => setEditor(blank(true))} />
        ) : null}
        <Button label="Add a family together on this phone" variant="outline" onPress={() => setEditor(blank(false))} />

        <View>
          <PlanningAccount />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
