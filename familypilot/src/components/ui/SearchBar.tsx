import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, ViewStyle } from 'react-native';

import { colors, fontFamily, radius, spacing } from '@/src/design-system/tokens';

import { CircleButton } from './CircleButton';
import { SearchGlyph } from './icons';
import { Text } from './Text';

interface SearchBarProps {
  value?: string;
  onChangeText?: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  /** What assistive technology calls the input. Defaults to the placeholder. */
  accessibilityLabel?: string;
  /** When set, the whole bar is a button (a Home shortcut into Explore) rather than an input. */
  onPress?: () => void;
  onFilterPress?: () => void;
  /** A small dot on the filter disc when filters are narrowing the list. */
  filterActive?: boolean;
  /**
   * Explore's variant (Figma "Search bar / Action"): a green "Search" pill tucked inside the right
   * edge in place of the filter disc, for a search that runs on demand rather than as you type.
   */
  actionLabel?: string;
  onAction?: () => void;
  actionAccessibilityLabel?: string;
  /**
   * `explore` is the approved Explore frame's field (294:133): 51.6 tall, placeholder 14.8, the green
   * Search pill 88.5 x 41.9 inset 5. `default` is Home's 56 field.
   */
  variant?: 'default' | 'explore';
  style?: ViewStyle;
  autoFocus?: boolean;
}

/** The reference's search control: one tall rounded field with a dark circular
 * filter button tucked into its right edge. */
export function SearchBar({
  value,
  onChangeText,
  onSubmit,
  placeholder = 'Search',
  accessibilityLabel,
  onPress,
  onFilterPress,
  filterActive = false,
  actionLabel,
  onAction,
  actionAccessibilityLabel,
  variant = 'default',
  style,
  autoFocus,
}: SearchBarProps) {
  const readOnly = Boolean(onPress);
  const explore = variant === 'explore';
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.wrap, explore && styles.wrapExplore, style]}>
      <Pressable
        accessibilityRole={readOnly ? 'button' : undefined}
        accessibilityLabel={readOnly ? placeholder : undefined}
        onPress={onPress}
        disabled={!readOnly}
        style={[
          styles.field,
          explore && styles.fieldExplore,
          onFilterPress ? styles.fieldWithFilter : null,
          // Keyboard focus must be visible. The input's own outline is removed (it would draw a box inside
          // the pill), so the pill carries the ring instead.
          focused && styles.fieldFocused,
        ]}
      >
        <SearchGlyph size={SEARCH_ICON} color={PLACEHOLDER_INK} />
        {readOnly ? (
          // A button that LOOKS like a field shows its hint as text. It used to draw a read-only text
          // input inside the button, which is a focusable control nested in another and had no name.
          <View style={styles.readOnlyLabel} pointerEvents="none">
            <Text numberOfLines={1} style={styles.readOnlyText}>
              {value || placeholder}
            </Text>
          </View>
        ) : (
          <TextInput
            accessibilityLabel={accessibilityLabel ?? placeholder}
            placeholder={placeholder}
            placeholderTextColor={PLACEHOLDER_INK}
            value={value}
            onChangeText={onChangeText}
            onSubmitEditing={onSubmit}
            returnKeyType="search"
            autoFocus={autoFocus}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={[styles.input, explore && styles.inputExplore]}
          />
        )}
        {actionLabel && onAction ? (
          // The pill is drawn 42 tall on Explore; its button is 44, so the target is real on the web
          // too (hitSlop is not).
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={actionAccessibilityLabel ?? actionLabel}
            onPress={onAction}
            style={[styles.actionHit, explore && styles.actionHitExplore]}
          >
            {({ pressed }) => (
              <View style={[styles.action, explore && styles.actionExplore, pressed && styles.actionPressed]}>
                <Text style={[styles.actionLabel, explore && styles.actionLabelExplore]}>{actionLabel}</Text>
              </View>
            )}
          </Pressable>
        ) : null}
      </Pressable>

      {/* The approved frame tucks the filter disc inside the field's right edge, not beside it.
          It sits over the field rather than within it so its press area stays its own. */}
      {onFilterPress ? (
        <CircleButton
          icon="sliders"
          accessibilityLabel="Filters"
          tone="dark"
          size={FILTER_SIZE}
          onPress={onFilterPress}
          style={styles.filter}
        />
      ) : null}
      {onFilterPress && filterActive ? <View pointerEvents="none" style={styles.filterDot} testID="filter-active-dot" /> : null}
    </View>
  );
}

/**
 * From the approved frame "01 — Home" (node "Search bar"): a 56pt field with the search glyph
 * 22px in, the placeholder starting at 56, and a 46px filter disc inset 5 from the right edge.
 */
const FIELD_HEIGHT = 56;
const FILTER_DOT = 11;
const FIELD_PADDING = 21;
const PLACEHOLDER_FONT_SIZE = 15.5;
const PLACEHOLDER_INK = colors.text.tertiary;
const SEARCH_ICON = 22;
const FILTER_SIZE = 46;
const FILTER_INSET = 5;
/** The action pill: 44 tall, inset 6, so it sits inside the field like the filter disc does. */
const ACTION_HEIGHT = 44;
const ACTION_INSET = 6;

/** Explore frame 294:133: 112px / 2.17 = 51.6 tall; the pill 192 x 91 px = 88.5 x 41.9, inset 5. */
const EXPLORE_FIELD_HEIGHT = 51.6;
const EXPLORE_ACTION_HEIGHT = 42;
const EXPLORE_ACTION_INSET = 5;

const styles = StyleSheet.create({
  wrap: {
    height: FIELD_HEIGHT,
    justifyContent: 'center',
  },
  wrapExplore: {
    height: EXPLORE_FIELD_HEIGHT,
  },
  fieldExplore: {
    height: EXPLORE_FIELD_HEIGHT,
  },
  inputExplore: {
    fontSize: 14.8,
  },
  actionExplore: {
    height: EXPLORE_ACTION_HEIGHT,
    borderRadius: EXPLORE_ACTION_HEIGHT / 2,
    minWidth: 88.5,
    paddingHorizontal: 18,
  },
  actionHitExplore: {
    marginRight: -(FIELD_PADDING - EXPLORE_ACTION_INSET),
  },
  actionLabelExplore: {
    fontSize: 13.4,
    lineHeight: 17,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: FIELD_HEIGHT,
    paddingHorizontal: FIELD_PADDING,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    // The frame carries a soft drop shadow here rather than an outline.
    shadowColor: colors.ink,
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 9,
    elevation: 2,
  },
  fieldWithFilter: {
    // Clear the disc so the placeholder never runs underneath it.
    paddingRight: FILTER_INSET + FILTER_SIZE + spacing.sm,
  },
  input: {
    flex: 1,
    // A web text input has an intrinsic width; without these it pushed the action pill out of the
    // field at 360 and 390 and the pill was clipped to "Searc".
    minWidth: 0,
    flexShrink: 1,
    // The whole height of the pill answers a tap, not just the line of text.
    alignSelf: 'stretch',
    fontFamily: fontFamily.regular,
    fontSize: PLACEHOLDER_FONT_SIZE,
    color: colors.text.primary,
    // Web needs the outline removed explicitly; RN ignores it.
    outlineStyle: 'none',
  } as never,
  readOnlyLabel: {
    flex: 1,
  },
  readOnlyText: {
    fontFamily: fontFamily.regular,
    fontSize: PLACEHOLDER_FONT_SIZE,
    color: PLACEHOLDER_INK,
  },
  fieldFocused: {
    outlineStyle: 'solid',
    outlineWidth: 2,
    outlineColor: colors.action,
    outlineOffset: 2,
  } as never,
  actionHit: {
    minHeight: 44,
    justifyContent: 'center',
    marginRight: -(FIELD_PADDING - ACTION_INSET),
  },
  filter: {
    position: 'absolute',
    right: FILTER_INSET,
    top: (FIELD_HEIGHT - FILTER_SIZE) / 2,
  },
  filterDot: {
    position: 'absolute',
    right: FILTER_INSET - 1,
    top: (FIELD_HEIGHT - FILTER_SIZE) / 2 - 1,
    width: FILTER_DOT,
    height: FILTER_DOT,
    borderRadius: FILTER_DOT / 2,
    backgroundColor: colors.warning[100],
    borderWidth: 2,
    borderColor: colors.surface,
  },
  action: {
    height: ACTION_HEIGHT,
    borderRadius: ACTION_HEIGHT / 2,
    paddingHorizontal: 18,
    backgroundColor: colors.action,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPressed: {
    backgroundColor: colors.actionPressed,
  },
  actionLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.text.inverse,
  },
});
