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

import { ChildSection } from '@/src/components/onboarding/ChildSection';
import { DobField } from '@/src/components/onboarding/DobField';
import { MobilityPicker } from '@/src/components/onboarding/MobilityPicker';
import { FeedEditor, NapEditor } from '@/src/components/onboarding/RoutineEditors';
import { TextField } from '@/src/components/profile/TextField';
import { BackButton } from '@/src/components/ui/BackButton';
import { Button, Chip, EmptyState, Text, TimeField, CHIP_GAP } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { useFamilyProfile, useUpdateFamilyProfile } from '@/src/hooks/use-queries';
import { resolveUkLocation } from '@/src/services/location/location-client';
import { FacilityType, FamilyProfile, FamilyRoutine } from '@/src/types';
import { AgeParts } from '@/src/utils/child-age';
import {
  MAX_CHILDREN,
  blankChild,
  describeAge,
  draftAge,
  draftDobMessage,
  questionsFor,
} from '@/src/utils/onboarding-draft';
import {
  EditChild,
  applyEditedChildren,
  editChildFromMember,
  editChildProblem,
} from '@/src/utils/profile-edit-draft';
import { createParentMember, formatBudgetTier } from '@/src/utils/profile-defaults';
import { budgetTierOf, driveLimitMinutes, unconfirmedValue, withoutUnconfirmed, UnconfirmedField } from '@/src/utils/preferences';
import { UnconfirmedPreferenceNotice } from '@/src/components/profile/UnconfirmedPreferenceNotice';
import { isPilotFeatureVisible } from '@/src/config/pilot-features';
import { ADULT_RELATIONSHIP_LABEL, createAdultMember } from '@/src/utils/household';
import { AdultRelationship } from '@/src/types';
import { feedNoun } from '@/src/utils/routine-schedule';

const BUDGET_OPTIONS: { id: NonNullable<FamilyProfile['budgetTier']>; label: string }[] = [
  { id: 'budget', label: 'Budget-friendly' },
  { id: 'moderate', label: 'Moderate' },
  { id: 'premium', label: 'Premium' },
];

const DRIVE_OPTIONS = [15, 20, 30, 45, 60, 90];
/** The offered limits plus whatever is stored, so a limit set elsewhere is never shown as nothing chosen. */
const driveOptions = (current: number | null) =>
  [...new Set([...DRIVE_OPTIONS, ...(current === null ? [] : [current])])].filter((m) => Number.isFinite(m) && m > 0).sort((a, b) => a - b);

const MUST_HAVE_OPTIONS: { id: FacilityType; label: string }[] = [
  { id: 'toilets', label: 'Toilets' },
  { id: 'baby_changing', label: 'Baby changing' },
  { id: 'parking', label: 'Parking' },
  { id: 'pushchair_friendly', label: 'Pushchair access' },
];

/** Alert.alert does nothing on web, where the pilot actually runs, so removal asks with the browser's own dialog there. */
function confirmRemove(name: string, onConfirm: () => void) {
  const title = `Remove ${name || 'this child'}?`;
  const message = 'This will update your recommendations.';
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: onConfirm },
  ]);
}

/** A child's age for choosing which questions to ask: from the typed date, else the age they were saved with. */
function ageOf(child: EditChild, now: Date): AgeParts | null {
  const typed = draftAge(child, now);
  if (typed) return typed;
  if (!child.legacy) return null;
  const { age, ageMonths } = child.legacy;
  const months = age === 0 ? (ageMonths ?? 0) : 0;
  return { years: age, months, totalMonths: age === 0 ? months : age * 12 };
}

// Fields that nothing in this build uses are not asked for (they come back with their feature).
const showCar = isPilotFeatureVisible('car_fit');
const showEquipment = isPilotFeatureVisible('packing');
const showMemberships = isPilotFeatureVisible('memberships');

export default function EditProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: profile, isLoading } = useFamilyProfile();
  const updateProfile = useUpdateFamilyProfile();

  const [parentName, setParentName] = useState('');
  const [familyName, setFamilyName] = useState('');
  /** The other adults in the household: kept, edited and saved with their own ids so nothing downstream loses them. */
  const [adults, setAdults] = useState<Array<{ id: string; name: string; relationship: AdultRelationship }>>([]);
  const [homeLocation, setHomeLocation] = useState('');
  const [children, setChildren] = useState<EditChild[]>([]);
  const [unowned, setUnowned] = useState<FamilyRoutine[]>([]);
  // Null is "not set": nothing is limited. Never initialised to a number the parent did not choose.
  const [maxDriveMinutes, setMaxDriveMinutes] = useState<number | null>(null);
  const [budgetTier, setBudgetTier] = useState<FamilyProfile['budgetTier']>(null);
  // Which of the set-aside legacy values the parent has answered this visit (by keeping it or choosing anything in its row).
  // Unanswered ones are left exactly as stored when the form is saved.
  const [answered, setAnswered] = useState<UnconfirmedField[]>([]);
  const answer = (field: UnconfirmedField) => setAnswered((current) => (current.includes(field) ? current : [...current, field]));
  const [vehicle, setVehicle] = useState('');
  const [pushchair, setPushchair] = useState('');
  const [travelCot, setTravelCot] = useState('');
  const [memberships, setMemberships] = useState('');
  const [mustHaveFacilities, setMustHaveFacilities] = useState<FacilityType[]>([]);
  const [resolvingHome, setResolvingHome] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!profile) return;

    setParentName(profile.parentName);
    setFamilyName(profile.familyName ?? '');
    setAdults(
      profile.members
        .filter((m) => m.role === 'parent' && m.relationship)
        .map((m) => ({ id: m.id, name: m.name, relationship: m.relationship as AdultRelationship })),
    );
    setHomeLocation(profile.homeLocation);
    setMaxDriveMinutes(driveLimitMinutes(profile));
    setBudgetTier(budgetTierOf(profile));
    setVehicle(profile.vehicle ?? '');
    setPushchair(profile.pushchair ?? '');
    setTravelCot(profile.travelCot ?? '');
    setMemberships((profile.memberships ?? []).join(', '));
    setUnowned((profile.routines ?? []).filter((r) => !r.childId));
    setMustHaveFacilities(profile.mustHaveFacilities ?? []);
    setChildren(
      profile.members
        .filter((m) => m.role === 'child')
        .map((m) => editChildFromMember(m, profile.routines)),
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
    if (adults.some((adult) => !adult.name.trim())) nextErrors.adults = 'Add a name for each adult, or remove them';

    if (children.length === 0) {
      nextErrors.children = 'Add at least one child';
    } else {
      for (const child of children) {
        const problem = editChildProblem(child, new Date());
        if (problem) {
          nextErrors.children = problem === 'Please add a name' ? problem : 'Please check the date of birth';
          break;
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

    const parentMember =
      profile.members.find((m) => m.role === 'parent' && !m.relationship) ??
      profile.members.find((m) => m.role === 'parent') ??
      createParentMember(parentName);
    const otherAdults = adults
      .filter((adult) => adult.name.trim())
      .map((adult) => {
        const existing = profile.members.find((m) => m.id === adult.id);
        return existing
          ? { ...existing, name: adult.name.trim(), relationship: adult.relationship }
          : { ...createAdultMember(adult.name, adult.relationship), id: adult.id };
      });
    const applied = applyEditedChildren(profile, children, unowned);

    await updateProfile.mutateAsync({
      parentName: parentName.trim(),
      familyName: familyName.trim() || undefined,
      homeLocation: homeLocation.trim(),
      homeLatitude,
      homeLongitude,
      maxDriveMinutes,
      budgetTier,
      // What is still unanswered stays set aside; answered fields leave it.
      unconfirmedPreferences: withoutUnconfirmed(profile, answered).unconfirmedPreferences,
      // The car, equipment and memberships fields are shown only when a feature uses them; while hidden, what was saved is
      // left exactly as it is.
      ...(showCar ? { vehicle: vehicle.trim() || null } : {}),
      ...(showEquipment ? { pushchair: pushchair.trim() || null, travelCot: travelCot.trim() || null } : {}),
      ...(showMemberships
        ? {
            memberships: memberships
              .split(',')
              .map((m) => m.trim())
              .filter(Boolean),
          }
        : {}),
      routines: applied.routines,
      mustHaveFacilities,
      members: [{ ...parentMember, name: parentName.trim() }, ...otherAdults, ...applied.members],
    });

    handleBack();
  };

  const addChild = () => {
    setChildren((prev) => [...prev, { ...blankChild(), legacy: null }]);
  };

  const updateChild = (id: string, patch: Partial<EditChild>) => {
    setChildren((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const removeChild = (id: string, name: string) => {
    confirmRemove(name, () => setChildren((prev) => prev.filter((c) => c.id !== id)));
  };

  const updateUnowned = (id: string, patch: Partial<FamilyRoutine>) => {
    setUnowned((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeUnowned = (id: string) => {
    setUnowned((prev) => prev.filter((r) => r.id !== id));
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
            Changes update your Family Fit scores
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
          hint="Used to calculate real travel and weather from your general area, not your full address"
          error={errors.homeLocation}
        />

        <TextField
          label="Household name (optional)"
          value={familyName}
          onChangeText={setFamilyName}
          autoCapitalize="words"
          hint="Your family’s surname, shown as “Shaw family” on your own screens. Never shared."
        />

        <Text variant="heading3" style={styles.sectionTitle}>
          Other adults in your household
        </Text>
        {adults.map((adult, index) => (
          <View key={adult.id} style={styles.adultCard} testID={`edit-adult-${index}`}>
            <TextField
              label="Their first name"
              value={adult.name}
              onChangeText={(name) => setAdults((prev) => prev.map((a) => (a.id === adult.id ? { ...a, name } : a)))}
              autoCapitalize="words"
            />
            <View style={styles.adultRow}>
              {(Object.keys(ADULT_RELATIONSHIP_LABEL) as AdultRelationship[]).map((relationship) => (
                <Chip
                  key={relationship}
                  size="small"
                  label={ADULT_RELATIONSHIP_LABEL[relationship]}
                  active={adult.relationship === relationship}
                  onPress={() => setAdults((prev) => prev.map((a) => (a.id === adult.id ? { ...a, relationship } : a)))}
                />
              ))}
              <Pressable
                onPress={() => setAdults((prev) => prev.filter((a) => a.id !== adult.id))}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${adult.name.trim() || 'this adult'}`}
                hitSlop={12}
                style={styles.adultRemove}
              >
                <Text variant="caption" color={colors.error[500]}>
                  Remove
                </Text>
              </Pressable>
            </View>
          </View>
        ))}
        {errors.adults ? (
          <Text variant="caption" color={colors.error[500]}>
            {errors.adults}
          </Text>
        ) : null}
        <Pressable
          onPress={() => setAdults((prev) => [...prev, { id: createAdultMember('x', 'other').id, name: '', relationship: prev.length === 0 ? 'partner' : 'other' }])}
          accessibilityRole="button"
          style={styles.addAdult}
          testID="edit-add-adult"
        >
          <Text variant="link">+ Add another adult</Text>
        </Pressable>

        <Text variant="heading3" style={styles.sectionTitle}>
          Children
        </Text>
        {children.map((child, index) => {
          const now = new Date();
          const age = ageOf(child, now);
          const typed = draftAge(child, now);
          const questions = age ? questionsFor(age.totalMonths) : null;
          const name = child.name.trim();
          const message = draftDobMessage(child, now);
          const legacyLabel = child.legacy
            ? child.legacy.age === 0 && child.legacy.ageMonths != null
              ? `${child.legacy.ageMonths} month${child.legacy.ageMonths === 1 ? '' : 's'}`
              : `${child.legacy.age} year${child.legacy.age === 1 ? '' : 's'}`
            : null;
          return (
            <ChildSection
              key={child.id}
              name={child.name}
              ageLabel={typed ? describeAge(typed) : legacyLabel}
            >
              <View>
                <TextField
                  label="Name"
                  value={child.name}
                  onChangeText={(value) => updateChild(child.id, { name: value })}
                  autoCapitalize="words"
                />
                <DobField
                  day={child.day}
                  month={child.month}
                  year={child.year}
                  childName={child.name}
                  onChange={(dob) => updateChild(child.id, dob)}
                  message={message}
                  ageLabel={typed ? describeAge(typed) : null}
                  hint={
                    child.legacy
                      ? `${name ? `Add ${name}’s birthday` : 'Add their birthday'} and their age keeps itself up to date`
                      : undefined
                  }
                />
              </View>
              {questions ? (
                <MobilityPicker
                  name={child.name}
                  options={questions.mobilityOptions}
                  value={child.mobility}
                  onChange={(mobility) => updateChild(child.id, { mobility })}
                />
              ) : null}
              {questions?.asksNaps ? (
                <NapEditor
                  name={child.name}
                  naps={child.naps}
                  onChange={(naps) => updateChild(child.id, { naps })}
                />
              ) : null}
              {questions?.asksFeeds && age ? (
                <FeedEditor
                  name={child.name}
                  noun={feedNoun({ age: age.years, ageMonths: age.years === 0 ? age.months : null })}
                  draft={child}
                  onChange={(patch) => updateChild(child.id, patch)}
                />
              ) : null}
              <Pressable
                onPress={() => removeChild(child.id, child.name)}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${name || `child ${index + 1}`}`}
                hitSlop={14}
                style={styles.removeChild}
              >
                <Text variant="caption" color={colors.error[500]}>
                  Remove {name || 'this child'}
                </Text>
              </Pressable>
            </ChildSection>
          );
        })}
        {errors.children ? (
          <Text variant="caption" color={colors.error[500]} style={styles.errorText}>
            {errors.children}
          </Text>
        ) : null}
        {children.length < MAX_CHILDREN ? (
          <Pressable onPress={addChild} style={styles.addChild} accessibilityRole="button">
            <Text variant="link" style={styles.addChildLabel}>
              + Add another child
            </Text>
          </Pressable>
        ) : null}

        {unowned.length > 0 ? (
          <View>
            <Text variant="heading3" style={styles.sectionTitle}>
              Other naps and feeds
            </Text>
            <Text variant="bodySmall" color={colors.text.secondary} style={styles.groupLabel}>
              Saved before naps and feeds belonged to a child. They still count. Remove any that no
              longer apply.
            </Text>
            {unowned.map((routine) => (
              <View key={routine.id} style={styles.childBlock}>
                <View style={styles.childHeader}>
                  <Text variant="label" color={colors.text.secondary}>
                    {routine.label?.trim() || (routine.kind === 'nap' ? 'Nap' : 'Feed')}
                  </Text>
                  <Pressable onPress={() => removeUnowned(routine.id)} accessibilityRole="button" hitSlop={14}>
                    <Text variant="caption" color={colors.error[500]}>
                      Remove
                    </Text>
                  </Pressable>
                </View>
                <TimeField
                  label="Usual time"
                  value={routine.time}
                  onChange={(time) => updateUnowned(routine.id, { time })}
                />
              </View>
            ))}
          </View>
        ) : null}

        <Text variant="heading3" style={styles.sectionTitle}>
          Travel and budget (optional)
        </Text>
        <Text variant="bodySmall" color={colors.text.secondary} style={styles.groupLabel}>
          Leave these alone and nothing is limited: we show every distance and every price. Choose one and we flag places that
          don’t fit.
        </Text>
        <Text variant="label" color={colors.text.secondary} style={styles.groupLabel}>
          Longest journey you’d make
        </Text>
        {profile && maxDriveMinutes === null && !answered.includes('maxDriveMinutes') && unconfirmedValue(profile, 'maxDriveMinutes') !== null ? (
          <UnconfirmedPreferenceNotice
            testID="unconfirmed-drive"
            question={`An earlier version of the app set this to ${unconfirmedValue(profile, 'maxDriveMinutes')} minutes, and we can’t tell whether you chose it. Nothing is limited meanwhile.`}
            keepLabel={`Yes, keep ${unconfirmedValue(profile, 'maxDriveMinutes')} minutes`}
            onKeep={() => {
              setMaxDriveMinutes(unconfirmedValue(profile, 'maxDriveMinutes'));
              answer('maxDriveMinutes');
            }}
          />
        ) : null}
        <View style={styles.chipRow}>
          <Chip
            label="No limit"
            active={maxDriveMinutes === null}
            onPress={() => {
              setMaxDriveMinutes(null);
              answer('maxDriveMinutes');
            }}
          />
          {driveOptions(maxDriveMinutes).map((minutes) => (
            <Chip
              key={minutes}
              label={`${minutes} min`}
              active={maxDriveMinutes === minutes}
              onPress={() => {
                setMaxDriveMinutes(minutes);
                answer('maxDriveMinutes');
              }}
            />
          ))}
        </View>

        <Text variant="label" color={colors.text.secondary} style={styles.groupLabel}>
          Budget ({formatBudgetTier(budgetTier)})
        </Text>

        {/* The same Chip as drive time above and frame 04's option rows: one selected treatment per app. */}
        {profile && budgetTier === null && !answered.includes('budgetTier') && unconfirmedValue(profile, 'budgetTier') !== null ? (
          <UnconfirmedPreferenceNotice
            testID="unconfirmed-budget"
            question={`An earlier version of the app set this to “${formatBudgetTier(unconfirmedValue(profile, 'budgetTier'))}”, and we can’t tell whether you chose it. Nothing is limited meanwhile.`}
            keepLabel={`Yes, keep ${formatBudgetTier(unconfirmedValue(profile, 'budgetTier'))}`}
            onKeep={() => {
              setBudgetTier(unconfirmedValue(profile, 'budgetTier'));
              answer('budgetTier');
            }}
          />
        ) : null}
        <View style={styles.chipRow}>
          <Chip
            label="No preference"
            active={budgetTier === null}
            onPress={() => {
              setBudgetTier(null);
              answer('budgetTier');
            }}
          />
          {BUDGET_OPTIONS.map((option) => (
            <Chip
              key={option.id}
              label={option.label}
              active={budgetTier === option.id}
              onPress={() => {
                setBudgetTier(option.id);
                answer('budgetTier');
              }}
            />
          ))}
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

        {showCar || showEquipment ? (
          <>
        <Text variant="heading3" style={styles.sectionTitle}>
          Vehicle & equipment
        </Text>
            {showCar ? (
        <TextField
          label="Car"
          value={vehicle}
          onChangeText={setVehicle}
          placeholder="e.g. Tesla Model Y"
          hint="Unlocks Car Fit recommendations"
        />
            ) : null}
            {showEquipment ? (
              <>
        <TextField
          label="Pushchair make and model"
          value={pushchair}
          onChangeText={setPushchair}
          placeholder="e.g. Bugaboo Butterfly"
          hint="Optional. For packing and travel tips. How each child gets around is set under Children."
        />
        <TextField
          label="Travel cot"
          value={travelCot}
          onChangeText={setTravelCot}
          placeholder="Optional"
        />

              </>
            ) : null}
          </>
        ) : null}

        {showMemberships ? (
          <>
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
          </>
        ) : null}
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
  adultCard: { marginBottom: spacing.md, padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderLight },
  adultRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  adultRemove: { marginLeft: 'auto', minHeight: 44, justifyContent: 'center' },
  addAdult: { minHeight: 44, justifyContent: 'center', marginBottom: spacing.sm },
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
  removeChild: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
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
    gap: CHIP_GAP,
    marginBottom: spacing.xl,
  },
  chipColumn: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  addChildLabel: {
    fontSize: 16,
    lineHeight: 24,
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
