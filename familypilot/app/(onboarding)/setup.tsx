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
import { Button, Text } from '@/src/components/ui';
import { colors, spacing } from '@/src/design-system/tokens';
import { resolveUkLocation, ResolvedLocation } from '@/src/services/location/location-client';
import { accountRequired, useAuthStore } from '@/src/stores/auth-store';
import { useFamilyStore } from '@/src/stores/family-store';
import { usePendingInviteStore } from '@/src/stores/pending-invite-store';
import {
  DraftChild,
  MAX_CHILDREN,
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

type StepKey = 'parent' | 'children' | 'mobility' | 'routines';

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
    () => ['parent', 'children', 'mobility', ...(needsRoutines ? (['routines'] as const) : [])],
    [needsRoutines],
  );
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const totalSteps = stepIndex < 2 ? 4 : steps.length;

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
          subtitle: 'So we can say when to leave to be home in time.',
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
      children,
    });
    setProfile(profile);
    completeOnboarding();
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

  const isLast = stepIndex >= steps.length - 1 && step !== 'parent' && step !== 'children';

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
  footer: { paddingTop: spacing.lg, paddingBottom: spacing.md },
});
