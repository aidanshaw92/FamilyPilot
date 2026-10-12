import { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { BrandMark } from '@/src/components/ui/BrandMark';
import { BackButton } from '@/src/components/ui/BackButton';
import { Text } from '@/src/components/ui/Text';
import { colors, spacing } from '@/src/design-system/tokens';

/**
 * The one header for FamilyPilot's section pages: Families, Plans, Profile, Halfway, Saved.
 *
 * Home and Explore keep the approved frames' own headers (the greeting; "Explore London"), with the same brand row
 * (`BrandLockup`) above them, so the mark and the wordmark sit in the same place on every main screen.
 * Every other main page had grown a header of its own (a centred chevron here, a heading with a subtitle in a different
 * size there), which is a large part of why the app read as several apps. This gives them one: the brand lockup (the
 * approved mark beside the wordmark, small), an optional back control and an optional action on the right, then the
 * page's title and one line that says what the page is for, at the Explore frame's sizes (28.4 / 34.5 and 13.6 / 17).
 *
 * The lockup is decoration beside a title that already names the page, so it is hidden from screen readers; the back
 * control and the action keep their own labels.
 */
export function PageHeader({
  title,
  subtitle,
  onBack,
  action,
  flush,
  testID,
}: {
  title: string;
  subtitle?: string;
  /** Present on a stack screen (Families, Saved); a tab has no back. */
  onBack?: () => void;
  /** One control on the right of the lockup row, such as the Families pill. */
  action?: ReactNode;
  /** True inside a scroll view that already pads the screen edges, so the header is not indented twice. */
  flush?: boolean;
  testID?: string;
}) {
  return (
    <View style={[styles.header, flush && styles.flush]} testID={testID}>
      <BrandLockup onBack={onBack} action={action} flush />
      <Text variant="heading1" style={styles.title} numberOfLines={2} testID={testID ? `${testID}-title` : undefined}>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="body" color={colors.text.secondary} style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The brand row's height and the air above it, so a screen that places it above locked geometry (Home, Explore) can account
 * for it exactly. Thirty-six, not forty-four: on a standard iPhone Home has no spare room, and every point the row takes
 * comes out of the deck (see home-vertical-layout). The 44 point back control is centred in the row and overflows it, so
 * its tap target is unchanged. The mark sits at the same height on every main screen: 10 points down, 36 tall.
 */
export const BRAND_ROW_HEIGHT = 36;
export const BRAND_ROW_TOP = 10;

/**
 * The brand row on its own: the approved mark beside the wordmark, an optional back control on the left and one optional
 * control on the right. PageHeader draws it above a title; Home and Explore draw it above their approved headers.
 */
export function BrandLockup({
  onBack,
  action,
  flush,
  testID,
  gap = spacing.sm,
}: {
  onBack?: () => void;
  action?: ReactNode;
  /** True when the parent already pads the screen edges. */
  flush?: boolean;
  testID?: string;
  /** Space under the row: a title follows it on section pages; Home and Explore sit it directly above their own header. */
  gap?: number;
}) {
  return (
    <View style={[styles.lockupRow, !flush && styles.lockupRowPadded, { marginBottom: gap }]} testID={testID}>
      {onBack ? (
        <View style={styles.back}>
          <BackButton onPress={onBack} />
        </View>
      ) : null}
      <View style={styles.lockup} accessible={false} importantForAccessibility="no-hide-descendants" testID="page-header-brand">
        <BrandMark size={22} tone="light" decorative />
        <Text style={styles.wordmark} accessibilityElementsHidden>
          FamilyPilot
        </Text>
      </View>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.screenPadding, paddingTop: 2 },
  flush: { paddingHorizontal: 0 },
  lockupRow: { height: BRAND_ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lockupRowPadded: { paddingHorizontal: spacing.screenPadding },
  back: { marginLeft: -12 },
  lockup: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  wordmark: { fontFamily: 'Inter_700Bold', fontSize: 15, lineHeight: 18, letterSpacing: -0.2, color: colors.ink },
  action: { alignItems: 'flex-end' },
  title: { fontSize: 28.4, lineHeight: 34.5 },
  subtitle: { marginTop: 7, fontSize: 13.6, lineHeight: 17 },
});
