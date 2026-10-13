import { Ionicons } from '@expo/vector-icons';
import { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/src/components/ui';
import { MIN_TARGET } from '@/src/components/ui/touch';
import { colors, fontFamily, radius, shadows, spacing } from '@/src/design-system/tokens';

/** The two initials of who is meeting: yours in the action green's mint, theirs in the other family's tint. */
function Avatars({ other }: { other: string | null }) {
  return (
    <View style={styles.avatars} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <View style={[styles.avatar, { backgroundColor: colors.actionSoft }]}>
        <Text style={[styles.avatarText, { color: colors.action }]}>Y</Text>
      </View>
      <View style={[styles.avatar, styles.avatarOther, { backgroundColor: colors.tint.lilac }]}>
        <Text style={[styles.avatarText, { color: other ? '#6B21E8' : colors.text.tertiary }]}>{other ? other.trim().charAt(0).toUpperCase() : '?'}</Text>
      </View>
    </View>
  );
}

/**
 * The page's header: the title, the one line saying what the page is for, then who you are meeting and when on one card
 * that opens the edit sheet, with the controls button beside it. Both open the same sheet.
 */
export function HalfwayHeader({
  who,
  when,
  otherName,
  onEdit,
}: {
  /** "You + Kevin’s family", or the prompt to choose. */
  who: string;
  /** "Sat 17 Oct · arrive 10:00"; absent until someone is chosen. */
  when: string | null;
  otherName: string | null;
  onEdit: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 9 }]} testID="halfway-header">
      <Text variant="heading1" style={styles.title} accessibilityRole="header" testID="halfway-header-title">Meet halfway</Text>
      <Text variant="body" color={colors.text.secondary} style={styles.subtitle}>Places that work for two families</Text>
      {/* The selector is the way into the edit sheet; it is not shown while there is nobody to meet and nothing to edit yet. */}
      <View style={styles.selectorRow}>
        <Pressable
          style={({ pressed }) => [styles.selector, pressed && styles.pressed]}
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={`${who}${when ? `, ${when}` : ''}. Edit meeting details`}
          testID="halfway-selector"
        >
          <Avatars other={otherName} />
          <View style={styles.selectorText}>
            <Text style={styles.selectorWho}>{who}</Text>
            {when ? <Text style={styles.selectorWhen}>{when}</Text> : null}
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel="Edit meeting details"
          testID="halfway-edit"
        >
          <Ionicons name="options-outline" size={22} color={colors.ink} />
        </Pressable>
      </View>
    </View>
  );
}

/** The header without the selector: for the states that have no meeting yet (your starting point missing, nobody chosen). */
export function HalfwayTitle() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 9 }]} testID="halfway-header">
      <Text variant="heading1" style={styles.title} accessibilityRole="header" testID="halfway-header-title">Meet halfway</Text>
      <Text variant="body" color={colors.text.secondary} style={styles.subtitle}>Places that work for two families</Text>
    </View>
  );
}

/** Map | List, one control. Both segments keep a 44pt target; the chosen one is the action green. */
export function MapListToggle({ mode, onChange, disabled = false }: { mode: 'map' | 'list'; onChange: (mode: 'map' | 'list') => void; disabled?: boolean }) {
  return (
    <View style={[styles.toggle, disabled && styles.toggleDisabled]} accessibilityRole="radiogroup" accessibilityLabel="Show places on" testID="halfway-toggle">
      {(['map', 'list'] as const).map((key) => {
        const active = mode === key;
        return (
          <Pressable
            key={key}
            style={[styles.segment, active && styles.segmentActive]}
            onPress={() => !disabled && onChange(key)}
            accessibilityRole="radio"
            accessibilityState={{ checked: active, disabled }}
            aria-checked={active}
            accessibilityLabel={key === 'map' ? 'Map' : 'List'}
            testID={`halfway-mode-${key}`}
          >
            <Ionicons name={key === 'map' ? 'map-outline' : 'list-outline'} size={17} color={active ? colors.text.inverse : colors.text.secondary} />
            <Text style={[styles.segmentText, { color: active ? colors.text.inverse : colors.text.secondary }]}>{key === 'map' ? 'Map' : 'List'}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The rounded white surface every bottom card sits on: grabber, shadow, the corner of the app's sheets. */
export function SheetSurface({ children, onGrab, grabLabel, bottomPadding, testID }: { children: ReactNode; onGrab?: () => void; grabLabel?: string; bottomPadding: number; testID?: string }) {
  return (
    <View style={[styles.sheet, { paddingBottom: bottomPadding }]} testID={testID}>
      <Pressable
        onPress={onGrab}
        disabled={!onGrab}
        accessibilityRole={onGrab ? 'button' : undefined}
        accessibilityLabel={grabLabel}
        style={styles.grabberRow}
        hitSlop={{ top: 8, bottom: 8 }}
      >
        <View style={styles.grabber} />
      </Pressable>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.screenPadding, backgroundColor: colors.background, paddingBottom: 6 },
  title: { marginBottom: 0 },
  subtitle: { marginTop: 2, fontSize: 14, lineHeight: 20 },
  selectorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 7 },
  selector: { flex: 1, minHeight: 56, borderRadius: radius.xl, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, ...shadows.card },
  pressed: { opacity: 0.85 },
  selectorText: { flex: 1, gap: 1 },
  selectorWho: { fontFamily: fontFamily.semiBold, fontSize: 15, lineHeight: 20, color: colors.ink },
  selectorWhen: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 16, color: colors.text.secondary },
  editButton: { width: 48, height: 48, flexShrink: 0, borderRadius: 24, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadows.card },
  avatars: { flexDirection: 'row' },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface },
  avatarOther: { marginLeft: -8 },
  avatarText: { fontFamily: fontFamily.bold, fontSize: 12, lineHeight: 15 },
  toggle: { minWidth: 163, minHeight: MIN_TARGET, borderRadius: 22, backgroundColor: colors.surface, flexDirection: 'row', padding: 0, alignItems: 'center', ...shadows.card },
  toggleDisabled: { opacity: 0.55 },
  segment: { flex: 1, minHeight: MIN_TARGET, paddingHorizontal: 8, borderRadius: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  segmentActive: { backgroundColor: colors.action },
  segmentText: { fontFamily: fontFamily.semiBold, fontSize: 14, lineHeight: 18 },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, paddingHorizontal: spacing.screenPadding, ...shadows.bottomSheet },
  grabberRow: { alignItems: 'center', paddingTop: 8, paddingBottom: 10, minHeight: 23 },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border },
});
