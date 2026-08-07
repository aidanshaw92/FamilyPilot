import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TextField } from '@/src/components/profile/TextField';
import { BackButton } from '@/src/components/ui/BackButton';
import { Button, Chip, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { useFamilyProfile, useUpdateFamilyProfile } from '@/src/hooks/use-queries';
import { FamilyMember, FamilyProfile } from '@/src/types';
import {
  createChildMember,
  createParentMember,
  formatBudgetTier,
} from '@/src/utils/profile-defaults';

const BUDGET_OPTIONS: { id: FamilyProfile['budgetTier']; label: string }[] = [
  { id: 'budget', label: 'Budget-friendly' },
  { id: 'moderate', label: 'Moderate' },
  { id: 'premium', label: 'Premium' },
];

const DRIVE_OPTIONS = [15, 20, 30, 45, 60];

interface DraftChild {
  id: string;
  name: string;
  age: string;
}

export default function EditProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: profile, isLoading } = useFamilyProfile();
  const updateProfile = useUpdateFamilyProfile();

  const [parentName, setParentName] = useState('');
  const [homeLocation, setHomeLocation] = useState('');
  const [children, setChildren] = useState<DraftChild[]>([]);
  const [maxDriveMinutes, setMaxDriveMinutes] = useState(30);
  const [budgetTier, setBudgetTier] = useState<FamilyProfile['budgetTier']>('moderate');
  const [vehicle, setVehicle] = useState('');
  const [pushchair, setPushchair] = useState('');
  const [travelCot, setTravelCot] = useState('');
  const [memberships, setMemberships] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!profile) return;

    setParentName(profile.parentName);
    setHomeLocation(profile.homeLocation);
    setMaxDriveMinutes(profile.maxDriveMinutes);
    setBudgetTier(profile.budgetTier);
    setVehicle(profile.vehicle ?? '');
    setPushchair(profile.pushchair ?? '');
    setTravelCot(profile.travelCot ?? '');
    setMemberships((profile.memberships ?? []).join(', '));
    setChildren(
      profile.members
        .filter((m) => m.role === 'child')
        .map((m) => ({ id: m.id, name: m.name, age: String(m.age) })),
    );
  }, [profile]);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile' as never);
  };

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};

    if (!parentName.trim()) nextErrors.parentName = 'Please enter your first name';
    if (!homeLocation.trim()) nextErrors.homeLocation = 'Please enter your home area';

    const validChildren = children.filter((c) => c.name.trim() && c.age.trim());
    if (validChildren.length === 0) {
      nextErrors.children = 'Add at least one child';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate() || !profile) return;

    const childMembers: FamilyMember[] = children
      .filter((c) => c.name.trim() && c.age.trim())
      .map((c) => createChildMember(c.name, Number(c.age)));

    const parentMember =
      profile.members.find((m) => m.role === 'parent') ?? createParentMember(parentName);

    await updateProfile.mutateAsync({
      parentName: parentName.trim(),
      homeLocation: homeLocation.trim(),
      maxDriveMinutes,
      budgetTier,
      vehicle: vehicle.trim() || null,
      pushchair: pushchair.trim() || null,
      travelCot: travelCot.trim() || null,
      memberships: memberships
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean),
      members: [{ ...parentMember, name: parentName.trim() }, ...childMembers],
    });

    handleBack();
  };

  const addChild = () => {
    setChildren((prev) => [...prev, { id: `child-${Date.now()}`, name: '', age: '' }]);
  };

  const updateChild = (id: string, field: 'name' | 'age', value: string) => {
    setChildren((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const removeChild = (id: string) => {
    Alert.alert('Remove child?', 'This will update your recommendations.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => setChildren((prev) => prev.filter((c) => c.id !== id)),
      },
    ]);
  };

  if (isLoading || !profile) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text variant="body">Loading profile…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <BackButton onPress={handleBack} />
        <View style={styles.headerText}>
          <Text variant="heading1">Edit profile</Text>
          <Text variant="bodySmall" color={colors.text.secondary}>
            Changes update your Family Match scores
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text variant="heading3" style={styles.sectionTitle}>
          About you
        </Text>
        <TextField
          label="Your first name"
          value={parentName}
          onChangeText={setParentName}
          autoCapitalize="words"
          error={errors.parentName}
        />
        <TextField
          label="Home town or postcode"
          value={homeLocation}
          onChangeText={setHomeLocation}
          autoCapitalize="words"
          hint="General area only — not your full address"
          error={errors.homeLocation}
        />

        <Text variant="heading3" style={styles.sectionTitle}>
          Children
        </Text>
        {children.map((child, index) => (
          <View key={child.id} style={styles.childBlock}>
            <View style={styles.childHeader}>
              <Text variant="label" color={colors.text.secondary}>
                Child {index + 1}
              </Text>
              <Pressable onPress={() => removeChild(child.id)} accessibilityRole="button">
                <Text variant="caption" color={colors.error[500]}>
                  Remove
                </Text>
              </Pressable>
            </View>
            <TextField
              label="Name"
              value={child.name}
              onChangeText={(value) => updateChild(child.id, 'name', value)}
              autoCapitalize="words"
            />
            <TextField
              label="Age"
              value={child.age}
              onChangeText={(value) => updateChild(child.id, 'age', value.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
            />
          </View>
        ))}
        {errors.children ? (
          <Text variant="caption" color={colors.error[500]} style={styles.errorText}>
            {errors.children}
          </Text>
        ) : null}
        <Pressable onPress={addChild} style={styles.addChild} accessibilityRole="button">
          <Text variant="body" color={colors.primary[500]}>
            + Add another child
          </Text>
        </Pressable>

        <Text variant="heading3" style={styles.sectionTitle}>
          Preferences
        </Text>
        <Text variant="label" color={colors.text.secondary} style={styles.groupLabel}>
          Maximum drive time
        </Text>
        <View style={styles.chipRow}>
          {DRIVE_OPTIONS.map((minutes) => (
            <Chip
              key={minutes}
              label={`${minutes} min`}
              active={maxDriveMinutes === minutes}
              onPress={() => setMaxDriveMinutes(minutes)}
            />
          ))}
        </View>

        <Text variant="label" color={colors.text.secondary} style={styles.groupLabel}>
          Budget — currently {formatBudgetTier(budgetTier)}
        </Text>
        <View style={styles.chipColumn}>
          {BUDGET_OPTIONS.map((option) => (
            <Pressable
              key={option.id}
              style={[styles.budgetOption, budgetTier === option.id && styles.budgetOptionActive]}
              onPress={() => setBudgetTier(option.id)}
              accessibilityRole="button"
            >
              <Text variant="body">{option.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text variant="heading3" style={styles.sectionTitle}>
          Vehicle & equipment
        </Text>
        <TextField
          label="Car"
          value={vehicle}
          onChangeText={setVehicle}
          placeholder="e.g. Tesla Model Y"
          hint="Unlocks Car Fit recommendations"
        />
        <TextField
          label="Pushchair"
          value={pushchair}
          onChangeText={setPushchair}
          placeholder="e.g. Bugaboo Butterfly"
        />
        <TextField
          label="Travel cot"
          value={travelCot}
          onChangeText={setTravelCot}
          placeholder="Optional"
        />

        <Text variant="heading3" style={styles.sectionTitle}>
          Memberships
        </Text>
        <TextField
          label="Memberships & passes"
          value={memberships}
          onChangeText={setMemberships}
          placeholder="e.g. National Trust, Merlin"
          hint="Separate multiple with commas"
        />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button
          label={updateProfile.isPending ? 'Saving…' : 'Save changes'}
          size="lg"
          fullWidth
          onPress={() => void handleSave()}
          disabled={updateProfile.isPending}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    paddingTop: spacing.xs,
  },
  content: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.lg,
  },
  sectionTitle: {
    marginBottom: spacing.lg,
    marginTop: spacing.lg,
  },
  childBlock: {
    marginBottom: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  childHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  addChild: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  errorText: {
    marginBottom: spacing.md,
  },
  groupLabel: {
    marginBottom: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  chipColumn: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  budgetOption: {
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  budgetOptionActive: {
    borderColor: colors.primary[500],
    backgroundColor: colors.primary[50],
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
});
