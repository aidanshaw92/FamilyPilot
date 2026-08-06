import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/src/components/ui/BackButton';
import { Button, Chip, Text } from '@/src/components/ui';
import { buildFeedbackUrl } from '@/src/config/feedback';
import { colors, radius, spacing } from '@/src/design-system/tokens';

const USE_AGAIN_OPTIONS = ['yes', 'maybe', 'no'] as const;

export default function FeedbackScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [rating, setRating] = useState(7);
  const [usefulFeature, setUsefulFeature] = useState('');
  const [biggestProblem, setBiggestProblem] = useState('');
  const [useAgain, setUseAgain] = useState<(typeof USE_AGAIN_OPTIONS)[number]>('maybe');
  const [comments, setComments] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile' as never);
  };

  const handleSubmit = () => {
    const url = buildFeedbackUrl({
      rating,
      usefulFeature,
      biggestProblem,
      useAgain,
      comments,
    });
    void Linking.openURL(url);
    setSubmitted(true);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackButton onPress={handleBack} />
        <View style={styles.headerText}>
          <Text variant="heading1">Send feedback</Text>
          <Text variant="bodySmall" color={colors.text.secondary}>
            Opens GitHub to submit your tester notes
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {submitted ? (
          <View style={styles.thanks}>
            <Text variant="heading3">Thank you</Text>
            <Text variant="bodySmall" color={colors.text.secondary}>
              Complete the GitHub issue in your browser to share your feedback with the team.
            </Text>
          </View>
        ) : null}

        <Text variant="heading3">Overall rating</Text>
        <View style={styles.ratingRow}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
            <Chip
              key={value}
              label={String(value)}
              active={rating === value}
              onPress={() => setRating(value)}
            />
          ))}
        </View>

        <Field
          label="Most useful feature"
          value={usefulFeature}
          onChangeText={setUsefulFeature}
          placeholder="e.g. Today's Pick, Need Now"
        />
        <Field
          label="Biggest problem"
          value={biggestProblem}
          onChangeText={setBiggestProblem}
          placeholder="What felt confusing or broken?"
        />

        <Text variant="heading3" style={styles.sectionLabel}>
          Would you use this again?
        </Text>
        <View style={styles.chipRow}>
          {USE_AGAIN_OPTIONS.map((option) => (
            <Chip
              key={option}
              label={option.charAt(0).toUpperCase() + option.slice(1)}
              active={useAgain === option}
              onPress={() => setUseAgain(option)}
            />
          ))}
        </View>

        <Field
          label="Comments"
          value={comments}
          onChangeText={setComments}
          placeholder="Anything else you'd like us to know"
          multiline
        />

        <Button label="Submit feedback" onPress={handleSubmit} style={styles.submit} />
      </ScrollView>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text variant="bodySmall" color={colors.text.secondary}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.text.tertiary}
        multiline={multiline}
        style={[styles.input, multiline && styles.inputMultiline]}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: spacing['3xl'],
  },
  thanks: {
    backgroundColor: colors.secondary[50],
    padding: spacing.lg,
    borderRadius: radius.lg,
    marginBottom: spacing['2xl'],
    gap: spacing.sm,
  },
  ratingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.md,
    marginBottom: spacing['2xl'],
  },
  sectionLabel: {
    marginBottom: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing['2xl'],
  },
  field: {
    marginBottom: spacing['2xl'],
    gap: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 44,
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    color: colors.text.primary,
  },
  inputMultiline: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  submit: {
    marginTop: spacing.lg,
  },
});
