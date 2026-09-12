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

import { AgeInput, AgeUnit } from '@/src/components/profile/AgeInput';
import { TextField } from '@/src/components/profile/TextField';
import { BackButton } from '@/src/components/ui/BackButton';
import { Button, Chip, EmptyState, Text, TimeField } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { useFamilyProfile, useUpdateFamilyProfile } from '@/src/hooks/use-queries';
import { resolveUkLocation } from '@/src/services/location/location-client';
import { FacilityType, FamilyMember, FamilyProfile, FamilyRoutine } from '@/src/types';
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

const MUST_HAVE_OPTIONS: { id: FacilityType; label: string }[] = [
  { id: 'toilets', label: 'Toilets' },
  { id: 'baby_changing', label: 'Baby changing' },
  { id: 'parking', label: 'Parking' },
  { id: 'pushchair_friendly', label: 'Pushchair access' },
];

interface DraftChild {
  id: string;
  name: string;
  age: string;
  ageUnit: AgeUnit;
}

function maxForUnit(unit: AgeUnit): number {
  return unit === 'months' ? 11 : 17;
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
  const [routines, setRoutines] = useState<FamilyRoutine[]>([]);
  const [mustHaveFacilities, setMustHaveFacilities] = useState<FacilityType[]>([]);
  const [resolvingHome, setResolvingHome] = useState(false);
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
    setRoutines(profile.routines ?? []);
    setMustHaveFacilities(profile.mustHaveFacilities ?? []);
    setChildren(
      profile.members
        .filter((m) => m.role === 'child')
        .map((m) =>
          m.age === 0 && m.ageMonths != null
            ? { id: m.id, name: m.name, age: String(m.ageMonths), ageUnit: 'months' as const }
            : { id: m.id, name: m.name, age: String(m.age), ageUnit: 'years' as const },
        ),
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
    } else {
      for (const child of children) {
        if (child.name.trim() && !child.age.trim()) {
          nextErrors.children = 'Please enter an age for each child';
          break;
        }
        if (child.age.trim()) {
          const age = Number(child.age);
          const max = maxForUnit(child.ageUnit);
          if (Number.isNaN(age) || age < 0 || age > max) {
            nextErrors.children =
              child.ageUnit === 'months'
                ? 'Months should be between 0 and 11'
                : 'Age should be between 0 and 17';
            break;
          }
        }
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate() || !profile) return;

    let homeLatitude = profile.homeLatitude;
    let homeLongitude = profile.homeLongitude;
    const locationChanged = homeLocation.trim() !== profile.homeLocation.trim();
    const hasCoordinates = Number.isFinite(homeLatitude) && Number.isFinite(homeLongitude);

    if (locationChanged || !hasCoordinates) {
      setResolvingHome(true);
      try {
        const location = await resolveUkLocation(homeLocation);
        homeLatitude = location.latitude;
        homeLongitude = location.longitude;
      } catch (error) {
        setErrors((current) => ({
          ...current,
          homeLocation: error instanceof Error ? error.message : 'Could not find that town or postcode.',
        }));
        return;
      } finally {
        setResolvingHome(false);
      }
    }

    const childMembers: FamilyMember[] = children
      .filter((c) => c.name.trim() && c.age.trim())
      .map((c) =>
        createChildMember(
          c.name,
          c.ageUnit === 'months' ? 0 : Number(c.age),
          c.ageUnit === 'months' ? Number(c.age) : null,
        ),
      );

    const parentMember =
      profile.members.find((m) => m.role === 'parent') ?? createParentMember(parentName);

    await updateProfile.mutateAsync({
      parentName: parentName.trim(),
      homeLocation: homeLocation.trim(),
      homeLatitude,
      homeLongitude,
      maxDriveMinutes,
      budgetTier,
      vehicle: vehicle.trim() || null,
      pushchair: pushchair.trim() || null,
      travelCot: travelCot.trim() || null,
      memberships: memberships
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean),
      routines,
      mustHaveFacilities,
      members: [{ ...parentMember, name: parentName.trim() }, ...childMembers],
    });

    handleBack();
  };

  const addChild = () => {
    setChildren((prev) => [...prev, { id: `child-${Date.now()}`, name: '', age: '', ageUnit: 'years' }]);
  };

  const updateChild = (id: string, field: 'name' | 'age', value: string) => {
    setChildren((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const updateChildUnit = (id: string, ageUnit: AgeUnit) => {
    setChildren((prev) => prev.map((c) => (c.id === id ? { ...c, ageUnit } : c)));
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

  const addRoutine = (kind: FamilyRoutine['kind']) => {
    setRoutines((prev) => [
      ...prev,
      {
        id: `routine-${Date.now()}`,
        label: '',
        kind,
        time: kind === 'nap' ? '13:00' : '12:00',
        durationMinutes: 60,
        atHome: true,
      },
    ]);
  };

  const updateRoutine = (id: string, patch: Partial<FamilyRoutine>) => {
    setRoutines((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRoutine = (id: string) => {
    setRoutines((prev) => prev.filter((r) => r.id !== id));
  };

  const toggleMustHave = (facility: FacilityType) => {
    setMustHaveFacilities((prev) =>
      prev.includes(facility) ? prev.filter((f) => f !== facility) : [...prev, facility],
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text variant="body">Loading profile…</Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <BackButton onPress={handleBack} />
        <EmptyState
          icon="person-circle-outline"
          title="We couldn't load your family profile"
          message="Set up your family to get personalised recommendations."
          actionLabel="Set up your family"
          onAction={() => router.replace('/(onboarding)/setup' as never)}
        />
      </View>
    );
  }

  const busy = updateProfile.isPending || resolvingHome;

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
          hint="Used to calculate real travel and weather from your general area — not your full address"
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
            <AgeInput
              value={child.age}
              unit={child.ageUnit}
              onChangeValue={(value) => updateChild(child.id, 'age', value)}
              onChangeUnit={(unit) => updateChildUnit(child.id, unit)}
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
          Usual feeds and naps
        </Text>
        <Text variant="bodySmall" color={colors.text.secondary} style={styles.groupLabel}>
          Lets us flag a recommendation that would run into nap time. You can still adjust times for a
          specific day when you plan one.
        </Text>
        {routines.map((routine) => (
          <View key={routine.id} style={styles.childBlock}>
            <View style={styles.childHeader}>
              <View style={styles.chipRow}>
                {(['nap', 'feed'] as const).map((kind) => (
                  <Chip
                    key={kind}
                    label={kind === 'nap' ? 'Nap' : 'Feed'}
                    active={routine.kind === kind}
                    onPress={() => updateRoutine(routine.id, { kind })}
                  />
                ))}
              </View>
              <Pressable onPress={() => removeRoutine(routine.id)} accessibilityRole="button">
                <Text variant="caption" color={colors.error[500]}>
                  Remove
                </Text>
              </Pressable>
            </View>
            <TextField
              label="Label (optional)"
              value={routine.label}
              onChangeText={(value) => updateRoutine(routine.id, { label: value })}
              placeholder={routine.kind === 'nap' ? 'e.g. Afternoon nap' : 'e.g. Lunch feed'}
            />
            <TimeField
              label="Usual time"
              value={routine.time}
              onChange={(time) => updateRoutine(routine.id, { time })}
            />
          </View>
        ))}
        <View style={styles.chipRow}>
          <Pressable onPress={() => addRoutine('nap')} style={styles.addChild} accessibilityRole="button">
            <Text variant="body" color={colors.primary[500]}>
              + Add a nap
            </Text>
          </Pressable>
          <Pressable onPress={() => addRoutine('feed')} style={styles.addChild} accessibilityRole="button">
            <Text variant="body" color={colors.primary[500]}>
              + Add a feed
            </Text>
          </Pressable>
        </View>

        <Text variant="heading3" style={styles.sectionTitle}>
          Must-have facilities
        </Text>
        <Text variant="bodySmall" color={colors.text.secondary} style={styles.groupLabel}>
          We'll flag a recommendation that doesn't confirm one of these instead of just listing
          facilities that don't matter to you.
        </Text>
        <View style={styles.chipRow}>
          {MUST_HAVE_OPTIONS.map((option) => (
            <Chip
              key={option.id}
              label={option.label}
              active={mustHaveFacilities.includes(option.id)}
              onPress={() => toggleMustHave(option.id)}
            />
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
          label={resolvingHome ? 'Checking your area…' : updateProfile.isPending ? 'Saving…' : 'Save changes'}
          size="lg"
          fullWidth
          onPress={() => void handleSave()}
          disabled={busy}
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
