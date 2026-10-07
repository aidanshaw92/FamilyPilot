import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { AdmissionPricing, admissionView, estimateFamilyAdmission } from '@/src/services/pricing/admission';
import { attendeesFromProfile } from '@/src/services/pricing/attendees';
import { FamilyProfile } from '@/src/types';

/**
 * What it costs to get in, said honestly.
 *
 * Today no place has a confirmed price, so this says "Price not confirmed" and sends the parent to the venue's own website;
 * it never shows a number it cannot source. When a place has a confirmed price it shows an estimate for the people in this
 * household (their ages on the day), the breakdown, the conditions, where and when it was checked, and any booking link. See
 * services/pricing/admission.ts for the rules.
 */
export function AdmissionCard({
  pricing,
  profile,
  website,
  today = new Date(),
}: {
  pricing?: AdmissionPricing | null;
  profile?: FamilyProfile | null;
  website?: string;
  today?: Date;
}) {
  const view = useMemo(() => {
    const visitDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const estimate = estimateFamilyAdmission(pricing ?? null, profile ? attendeesFromProfile(profile, today) : [], visitDate);
    return admissionView(estimate, pricing ?? null);
  }, [pricing, profile, today]);
  const link = view.bookingUrl ?? (website && /^https?:\/\//.test(website) ? website : null);
  const linkLabel = view.bookingUrl ? 'Book or check prices' : 'Check prices on the official website';

  return (
    <View style={styles.card} testID="admission-card">
      <View style={styles.head}>
        <Ionicons name="pricetag-outline" size={20} color={colors.text.secondary} />
        <View style={styles.text}>
          <Text variant="eyebrow">TO GET IN</Text>
          <Text variant="body" style={styles.headline} testID="admission-headline">
            {view.headline}
          </Text>
        </View>
      </View>
      {view.isEstimate ? (
        <Text variant="caption" color={colors.text.tertiary}>
          An estimate for your family. Confirm with the venue before you go.
        </Text>
      ) : null}
      {view.breakdown.map((line) => (
        <Text key={line} variant="bodySmall" color={colors.text.secondary}>
          {line}
        </Text>
      ))}
      {view.conditions.map((line) => (
        <Text key={line} variant="bodySmall" color={colors.text.secondary}>
          {line}
        </Text>
      ))}
      {view.bookingRequired ? (
        <Text variant="bodySmall" color={colors.text.secondary}>
          Booking is required.
        </Text>
      ) : null}
      {view.provenance ? (
        <Text variant="caption" color={colors.text.tertiary}>
          {view.provenance}
        </Text>
      ) : null}
      {link ? (
        <Pressable accessibilityRole="link" accessibilityLabel={linkLabel} onPress={() => void Linking.openURL(link)} style={styles.link} hitSlop={6}>
          <Text variant="link">{linkLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderLight, gap: spacing.xs },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  text: { flex: 1, gap: 2 },
  headline: { fontFamily: 'Inter_600SemiBold', color: colors.ink },
  link: { minHeight: 44, justifyContent: 'center' },
});
