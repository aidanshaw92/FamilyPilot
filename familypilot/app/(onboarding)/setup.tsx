import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OnboardingShell } from '@/src/components/onboarding/OnboardingShell';
import { AgeInput, AgeUnit } from '@/src/components/profile/AgeInput';
import { TextField } from '@/src/components/profile/TextField';
import { Button, Chip, Text } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { resolveUkLocation, ResolvedLocation } from '@/src/services/location/location-client';
import { useFamilyStore } from '@/src/stores/family-store';
import { FamilyProfile } from '@/src/types';
import {
  createChildMember,
  createParentMember,
  withCompletion,
} from '@/src/utils/profile-defaults';

const TOTAL_STEPS = 3;

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
  ageUnit: AgeUnit;
}

function maxForUnit(unit: AgeUnit): number {
  return unit === 'months' ? 11 : 17;
}

export default function SetupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setProfile = useFamilyStore((s) => s.setProfile);
  const completeOnboarding = useFamilyStore((s) => s.completeOnboarding);

  const [step, setStep] = useState(1);
  const [parentName, setParentName] = useState('');
  const [homeLocation, setHomeLocation] = useState('');
  const [resolvedHome, setResolvedHome] = useState<ResolvedLocation | null>(null);
  const [resolvingHome, setResolvingHome] = useState(false);
  const [children, setChildren] = useState<DraftChild[]>([
    { id: 'child-1', name: '', age: '', ageUnit: 'years' },
  ]);
  const [maxDriveMinutes, setMaxDriveMinutes] = useState(30);
  const [budgetTier, setBudgetTier] = useState<FamilyProfile['budgetTier']>('moderate');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const stepMeta = useMemo(
    () =>
      [
        {
          title: 'Let’s get started',
          subtitle:
            'Your name and general area are enough to personalise recommendations — your exact home address is never needed.',
        },
        {
          title: 'Who are we planning for?',
          subtitle:
            'Age — in years, or months for a baby under 1 — helps us recommend places that genuinely suit your family.',
        },
        {
          title: 'How do you usually plan days out?',
          subtitle: 'These defaults help Family Match — you can change them anytime in Profile.',
        },
      ][step - 1],
    [step],
  );

  const validateStep = (): boolean => {
    const nextErrors: Record<string, string> = {};

    if (step === 1) {
      if (!parentName.trim()) nextErrors.parentName = 'Please enter your first name';
      if (!homeLocation.trim()) nextErrors.homeLocation = 'Please enter your town or postcode';
    }

    if (step === 2) {
      const validChildren = children.filter((c) => c.name.trim() && c.age.trim());
      if (validChildren.length === 0) {
        nextErrors.children = 'Add at least one child with a name and age';
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
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleNext = async () => {
    if (!validateStep()) return;

    if (step === 1) {
      setResolvingHome(true);
      try {
        const location = await resolveUkLocation(homeLocation);
        setResolvedHome(location);
        setErrors({});
      } catch (error) {
        setErrors({
          homeLocation: error instanceof Error ? error.message : 'Could not find that town or postcode.',
        });
        return;
      } finally {
        setResolvingHome(false);
      }
    }

    if (step < TOTAL_STEPS) {
      setStep(step + 1);
      return;
    }

    if (!resolvedHome) {
      setStep(1);
      setErrors({ homeLocation: 'Please confirm your town or postcode again.' });
      return;
    }

    const childMembers = children
      .filter((c) => c.name.trim() && c.age.trim())
      .map((c) =>
        createChildMember(
          c.name,
          c.ageUnit === 'months' ? 0 : Number(c.age),
          c.ageUnit === 'months' ? Number(c.age) : null,
        ),
      );

    const profile = withCompletion({
      id: `family-${Date.now()}`,
      parentName: parentName.trim(),
      members: [createParentMember(parentName), ...childMembers],
      homeLocation: homeLocation.trim(),
      homeLatitude: resolvedHome.latitude,
      homeLongitude: resolvedHome.longitude,
      budgetTier,
      maxDriveMinutes,
      completionPercent: 0,
      vehicle: null,
      pushchair: null,
      travelCot: null,
      memberships: [],
    });

    setProfile(profile);
    completeOnboarding();
    router.replace('/(tabs)' as never);
  };

  const handleBack = () => {
    if (step === 1) {
      router.back();
      return;
    }
    setStep(step - 1);
  };

  const addChild = () => {
    setChildren((prev) => [
      ...prev,
      { id: `child-${Date.now()}`, name: '', age: '', ageUnit: 'years' },
    ]);
  };

  const updateChild = (id: string, field: 'name' | 'age', value: string) => {
    setChildren((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const updateChildUnit = (id: string, ageUnit: AgeUnit) => {
    setChildren((prev) => prev.map((c) => (c.id === id ? { ...c, ageUnit } : c)));
  };

  const removeChild = (id: string) => {
    setChildren((prev) => (prev.length <= 1 ? prev : prev.filter((c) => c.id !== id)));
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <OnboardingShell
        title={stepMeta.title}
        subtitle={stepMeta.subtitle}
        step={step}
        totalSteps={TOTAL_STEPS}
        onBack={handleBack}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          {step === 1 ? (
            <View>
              <TextField
                label="Your first name"
                value={parentName}
                onChangeText={setParentName}
                placeholder="e.g. Sarah"
                autoCapitalize="words"
                autoFocus
                error={errors.parentName}
              />
              <TextField
                label="Home town or postcode"
                value={homeLocation}
                onChangeText={(value) => {
                  setHomeLocation(value);
                  setResolvedHome(null);
                }}
                placeholder="e.g. Mill Hill or NW7 2AB"
                autoCapitalize="words"
                hint="We resolve this to a general area for travel and weather — never a full home address"
                error={errors.homeLocation}
              />
            </View>
          ) : null}

          {step === 2 ? (
            <View>
              {children.map((child, index) => (
                <View key={child.id} style={styles.childBlock}>
                  <View style={styles.childHeader}>
                    <Text variant="label" color={colors.text.secondary}>
                      Child {index + 1}
                    </Text>
                    {children.length > 1 ? (
                      <Pressable onPress={() => removeChild(child.id)} accessibilityRole="button">
                        <Text variant="caption" color={colors.error[500]}>
                          Remove
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <TextField
                    label="Name"
                    value={child.name}
                    onChangeText={(value) => updateChild(child.id, 'name', value)}
                    placeholder="e.g. Mia"
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
            </View>
          ) : null}

          {step === 3 ? (
            <View>
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
                Usual day-out budget
              </Text>
              <View style={styles.chipColumn}>
                {BUDGET_OPTIONS.map((option) => (
                  <Pressable
                    key={option.id}
                    style={[styles.budgetOption, budgetTier === option.id && styles.budgetOptionActive]}
                    onPress={() => setBudgetTier(option.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: budgetTier === option.id }}
                  >
                    <Text
                      variant="body"
                      color={budgetTier === option.id ? colors.primary[600] : colors.text.primary}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label={
              resolvingHome
                ? 'Finding your area…'
                : step === TOTAL_STEPS
                  ? 'See my recommendations'
                  : 'Continue'
            }
            size="lg"
            fullWidth
            disabled={resolvingHome}
            onPress={() => void handleNext()}
          />
        </View>
      </OnboardingShell>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
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
    paddingVertical: spacing.md,
  },
  errorText: {
    marginBottom: spacing.md,
  },
  groupLabel: {
    marginBottom: spacing.md,
    marginTop: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  chipColumn: {
    gap: spacing.sm,
  },
  budgetOption: {
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 48,
    justifyContent: 'center',
  },
  budgetOptionActive: {
    borderColor: colors.primary[500],
    backgroundColor: colors.primary[50],
  },
  footer: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
});
