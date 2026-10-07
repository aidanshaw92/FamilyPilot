import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChildAvatar } from '@/src/components/onboarding/ChildAvatar';
import { ChildSection } from '@/src/components/onboarding/ChildSection';
import { DobField } from '@/src/components/onboarding/DobField';
import { MobilityPicker } from '@/src/components/onboarding/MobilityPicker';
import { OnboardingShell } from '@/src/components/onboarding/OnboardingShell';
import { FeedEditor, NapEditor } from '@/src/components/onboarding/RoutineEditors';
import { TextField } from '@/src/components/profile/TextField';
import { Button, Chip, Text } from '@/src/components/ui';
import { colors, spacing } from '@/src/design-system/tokens';
import { venueService } from '@/src/services/api';
import { resolveUkLocation, ResolvedLocation } from '@/src/services/location/location-client';
import { accountRequired, useAuthStore } from '@/src/stores/auth-store';
import { useFamilyStore } from '@/src/stores/family-store';
import { usePendingInviteStore } from '@/src/stores/pending-invite-store';
import { ADULT_RELATIONSHIP_LABEL } from '@/src/utils/household';
import {
  DraftAdult,
  DraftChild,
  MAX_ADULTS,
  MAX_CHILDREN,
  blankAdult,
  anyRoutineQuestions,
  blankChild,
  buildOnboardingProfile,
  describeAge,
  draftAge,
  draftDob,
  draftDobMessage,
  questionsFor,
} from '@/src/utils/onboarding-draft';
import { feedNoun } from '@/src/utils/routine-schedule';

type StepKey = 'parent' | 'household' | 'children' | 'mobility' | 'routines';

/** Names of the children who are named, in order, as a parent would say them: "Mia and Theo". */
function sayNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export default function SetupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setProfile = useFamilyStore((s) => s.setProfile);
  const completeOnboarding = useFamilyStore((s) => s.completeOnboarding);
  const pendingInvite = usePendingInviteStore((s) => s.code);
  const authStatus = useAuthStore((s) => s.status);
  // Setting up a family comes after the account: a signed-out person is sent back to create one.
  useEffect(() => {
    if (accountRequired() && authStatus === 'signed_out') router.replace('/(onboarding)/account' as never);
  }, [authStatus, router]);

  const [stepIndex, setStepIndex] = useState(0);
  const [parentName, setParentName] = useState('');
  const [homeLocation, setHomeLocation] = useState('');
  const [resolvedHome, setResolvedHome] = useState<ResolvedLocation | null>(null);
  const [resolvingHome, setResolvingHome] = useState(false);
  const [familyName, setFamilyName] = useState('');
  // One card from the start: the first thing under "Who else is in your household?" is a person's first name, with how
  // they're connected beneath it. Left blank it means "just me" (blank cards are never saved as people).
  const [adults, setAdults] = useState<DraftAdult[]>(() => [blankAdult('partner')]);
  const [children, setChildren] = useState<DraftChild[]>(() => [blankChild()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showDobErrors, setShowDobErrors] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const cardBox = useRef<Record<string, { y: number; h: number }>>({});
  const viewH = useRef(0);

  const now = useMemo(() => new Date(), []);
  const needsRoutines = anyRoutineQuestions(children, now);
  // The naps-and-feeds step only exists for families with a child young enough to be asked.
  const steps: StepKey[] = useMemo(
    () => ['parent', 'household', 'children', 'mobility', ...(needsRoutines ? (['routines'] as const) : [])],
    [needsRoutines],
  );
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const totalSteps = stepIndex < 3 ? 5 : steps.length;

  const ready = children.filter((c) => c.name.trim() && draftDob(c));
  const one = ready.length === 1 ? ready[0].name.trim() : null;
  // Only the children who are young enough to be asked appear in the naps-and-feeds step and its title.
  const routineNames = ready
    .filter((c) => {
      const age = draftAge(c, now);
      const q = age ? questionsFor(age.totalMonths) : null;
      return q ? q.asksNaps || q.asksFeeds : false;
    })
    .map((c) => c.name.trim());

  const header = (() => {
    switch (step) {
      case 'parent':
        return { title: 'Let’s get started', subtitle: 'Just your name and the area you’re in.' };
      case 'household':
        return {
          title: 'Who else is in your household?',
          subtitle: 'Anyone who might come on days out. Optional, and it stays on this device.',
        };
      case 'children':
        return {
          title: 'Who are we planning for?',
          subtitle: 'Names and birthdays keep suggestions right as they grow. They stay on this device.',
        };
      case 'mobility':
        return {
          title: one ? `How does ${one} get around?` : 'How does everyone get around?',
          subtitle: 'So we can look for buggy-friendly, step-free or easy-walking places.',
        };
      default:
        return {
          title: routineNames.length === 1 ? `${routineNames[0]}’s usual day` : `${sayNames(routineNames)}’s usual days`,
          subtitle: 'So your plans can work around naps and feeds.',
        };
    }
  })();

  const updateChild = (id: string, patch: Partial<DraftChild>) =>
    setChildren((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (step === 'parent') {
      if (!parentName.trim()) next.parentName = 'Please enter your first name';
      if (!homeLocation.trim()) next.homeLocation = 'Please enter your town or postcode';
    }
    if (step === 'children') {
      setShowDobErrors(true);
      const named = children.filter((c) => c.name.trim() || c.day || c.month || c.year);
      if (named.length === 0) next.children = 'Add at least one child';
      let firstProblem: string | null = null;
      for (const child of named) {
        const problem = !child.name.trim()
          ? 'Please add a name for each child'
          : draftDobMessage(child, now, { final: true })
            ? 'Please check the date of birth'
            : null;
        if (problem) {
          next.children = next.children ?? problem;
          firstProblem = firstProblem ?? child.id;
        }
      }
      // The card with the problem may be below the fold on a small screen: bring it into view.
      if (firstProblem) {
        const box = cardBox.current[firstProblem] ?? { y: 0, h: 0 };
        // Top-aligned when the card fits the viewport, bottom-aligned (so the message under the date is
        // visible) when it does not.
        const target = Math.max(box.y - 8, box.y + box.h - viewH.current + 24, 0);
        requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: target, animated: true }));
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const finish = () => {
    if (!resolvedHome) {
      setStepIndex(0);
      setErrors({ homeLocation: 'Please confirm your town or postcode again.' });
      return;
    }
    const profile = buildOnboardingProfile({
      parentName,
      homeLocation,
      home: resolvedHome,
      familyName,
      adults,
      children,
    });
    setProfile(profile);
    completeOnboarding();
    // Home's list does not depend on the family (it is London-wide, personalised on the device), so it starts loading
    // now, while the next screen is read, instead of after Home opens. The same single request Home would send; Home
    // waits for this one rather than sending its own.
    venueService.prefetchNearby();
    // Someone who came through an invitation link goes back to it to accept. Everyone else with an account gets the
    // optional "Who do you plan days out with?" step; a build with no account backend has nothing to invite through.
    if (pendingInvite) router.replace(`/invite/${pendingInvite}` as never);
    else router.replace((accountRequired() ? '/(onboarding)/invite' : '/(tabs)') as never);
  };

  const handleNext = async () => {
    if (!validate()) return;

    if (step === 'parent') {
      setResolvingHome(true);
      try {
        setResolvedHome(await resolveUkLocation(homeLocation));
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

    if (stepIndex < steps.length - 1) {
      setStepIndex(stepIndex + 1);
      return;
    }
    finish();
  };

  const handleBack = () => {
    if (stepIndex === 0) {
      router.back();
      return;
    }
    setStepIndex(stepIndex - 1);
  };

  const isLast = stepIndex >= steps.length - 1 && step !== 'parent' && step !== 'household' && step !== 'children';

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <OnboardingShell
        title={header.title}
        subtitle={header.subtitle}
        step={Math.min(stepIndex + 1, totalSteps)}
        totalSteps={totalSteps}
        onBack={handleBack}
      >
        <ScrollView
          // One scroll view per step: a position left over from the previous step would open this one
          // part-way down.
          key={step}
          ref={scrollRef}
          onLayout={(e) => {
            viewH.current = e.nativeEvent.layout.height;
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          {step === 'parent' ? (
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
                hint="Only a general area, for travel and weather. Never your address."
                error={errors.homeLocation}
              />
            </View>
          ) : null}

          {step === 'household' ? (
            <View>
              {adults.map((adult, index) => (
                <View key={adult.id} style={styles.childCard} testID={`household-adult-${index}`}>
                  <View style={styles.childHeader}>
                    <ChildAvatar name={adult.name} size={36} />
                    <Text variant="label" color={colors.text.secondary} style={styles.childLabel}>
                      {adult.name.trim() || ADULT_RELATIONSHIP_LABEL[adult.relationship]}
                    </Text>
                    <Pressable
                      onPress={() => setAdults((prev) => prev.filter((a) => a.id !== adult.id))}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${adult.name.trim() || 'this adult'}`}
                      hitSlop={14}
                    >
                      <Text variant="caption" color={colors.error[500]}>
                        Remove
                      </Text>
                    </Pressable>
                  </View>
                  {/* The other person's own first name: never the family's surname (that is the household name below). */}
                  <TextField
                    label="Their first name"
                    value={adult.name}
                    onChangeText={(name) => setAdults((prev) => prev.map((a) => (a.id === adult.id ? { ...a, name } : a)))}
                    placeholder="e.g. Ellie"
                    autoCapitalize="words"
                  />
                  <Text variant="caption" color={colors.text.secondary} style={styles.relationshipLabel}>
                    How they’re connected to you
                  </Text>
                  <View style={styles.relationshipRow}>
                    {(Object.keys(ADULT_RELATIONSHIP_LABEL) as Array<keyof typeof ADULT_RELATIONSHIP_LABEL>).map((relationship) => (
                      <Chip
                        key={relationship}
                        size="small"
                        label={ADULT_RELATIONSHIP_LABEL[relationship]}
                        active={adult.relationship === relationship}
                        onPress={() => setAdults((prev) => prev.map((a) => (a.id === adult.id ? { ...a, relationship } : a)))}
                      />
                    ))}
                  </View>
                </View>
              ))}
              {adults.length < MAX_ADULTS ? (
                <Pressable
                  onPress={() => setAdults((prev) => [...prev, blankAdult(prev.length === 0 ? 'partner' : 'other')])}
                  style={styles.addChild}
                  accessibilityRole="button"
                  testID="household-add-adult"
                >
                  <Text variant="link" style={styles.addChildLabel}>
                    {adults.length === 0 ? '+ Add an adult' : '+ Add another adult'}
                  </Text>
                </Pressable>
              ) : null}
              <Text variant="caption" color={colors.text.secondary} style={styles.householdNote}>
                {adults.some((adult) => adult.name.trim())
                  ? 'Only first names and how you’re connected. No dates of birth, no contact details.'
                  : 'Just you? Leave this blank. You can add people later from Your family.'}
              </Text>
              {/* A household-level label, not a person: optional, and only ever shown on this person's own screens. */}
              <View style={styles.householdName}>
                <TextField
                  label="Household name (optional)"
                  value={familyName}
                  onChangeText={setFamilyName}
                  placeholder="e.g. Shaw"
                  autoCapitalize="words"
                  hint="Your family’s surname, shown as “Shaw family” on your own screens. Never shared."
                />
              </View>
            </View>
          ) : null}

          {step === 'children' ? (
            <View>
              {children.map((child, index) => {
                const age = draftAge(child, now);
                const message = showDobErrors
                  ? draftDobMessage(child, now, { final: Boolean(child.name.trim()) })
                  : draftDobMessage(child, now);
                return (
                  <View
                    key={child.id}
                    style={styles.childCard}
                    onLayout={(e) => {
                      cardBox.current[child.id] = { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height };
                    }}
                  >
                    <View style={styles.childHeader}>
                      <ChildAvatar name={child.name} size={36} />
                      <Text variant="label" color={colors.text.secondary} style={styles.childLabel}>
                        {child.name.trim() || `Child ${index + 1}`}
                      </Text>
                      {children.length > 1 ? (
                        <Pressable
                          onPress={() => setChildren((prev) => prev.filter((c) => c.id !== child.id))}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${child.name.trim() || `child ${index + 1}`}`}
                          hitSlop={14}
                        >
                          <Text variant="caption" color={colors.error[500]}>
                            Remove
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                    <TextField
                      label="Name"
                      value={child.name}
                      onChangeText={(name) => updateChild(child.id, { name })}
                      placeholder="e.g. Mia"
                      autoCapitalize="words"
                    />
                    <DobField
                      day={child.day}
                      month={child.month}
                      year={child.year}
                      childName={child.name}
                      onChange={(dob) => updateChild(child.id, dob)}
                      message={message}
                      ageLabel={age ? describeAge(age) : null}
                    />
                  </View>
                );
              })}
              {errors.children ? (
                <Text variant="caption" color={colors.error[500]} style={styles.errorText}>
                  {errors.children}
                </Text>
              ) : null}
              {children.length < MAX_CHILDREN ? (
                <Pressable
                  onPress={() => setChildren((prev) => [...prev, blankChild()])}
                  style={styles.addChild}
                  accessibilityRole="button"
                >
                  <Text variant="link" style={styles.addChildLabel}>
                    + Add another child
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {step === 'mobility'
            ? ready.map((child) => {
                const age = draftAge(child, now);
                if (!age) return null;
                return (
                  <ChildSection key={child.id} name={child.name} ageLabel={describeAge(age)}>
                    <MobilityPicker
                      name={child.name}
                      options={questionsFor(age.totalMonths).mobilityOptions}
                      value={child.mobility}
                      onChange={(mobility) => updateChild(child.id, { mobility })}
                    />
                  </ChildSection>
                );
              })
            : null}

          {step === 'routines'
            ? ready.map((child) => {
                const age = draftAge(child, now);
                if (!age) return null;
                const q = questionsFor(age.totalMonths);
                if (!q.asksNaps && !q.asksFeeds) return null;
                return (
                  <ChildSection key={child.id} name={child.name} ageLabel={describeAge(age)}>
                    {q.asksNaps ? (
                      <NapEditor
                        name={child.name}
                        naps={child.naps}
                        onChange={(naps) => updateChild(child.id, { naps })}
                      />
                    ) : null}
                    {q.asksFeeds ? (
                      <FeedEditor
                        name={child.name}
                        noun={feedNoun({ age: age.years, ageMonths: age.years === 0 ? age.months : null })}
                        draft={child}
                        onChange={(patch) => updateChild(child.id, patch)}
                      />
                    ) : null}
                  </ChildSection>
                );
              })
            : null}
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label={resolvingHome ? 'Finding your area…' : isLast ? 'See my recommendations' : 'Continue'}
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
  flex: { flex: 1, backgroundColor: colors.background },
  scrollContent: { flexGrow: 1, paddingBottom: spacing.xl },
  childCard: {
    marginBottom: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  childHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  childLabel: { flex: 1 },
  addChild: { minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingVertical: spacing.md },
  addChildLabel: { fontSize: 16, lineHeight: 24 },
  errorText: { marginBottom: spacing.md },
  relationshipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  householdNote: { marginTop: spacing.sm },
  householdName: { marginTop: spacing.xl },
  relationshipLabel: { marginTop: spacing.xs },
  footer: { paddingTop: spacing.lg, paddingBottom: spacing.md },
});
