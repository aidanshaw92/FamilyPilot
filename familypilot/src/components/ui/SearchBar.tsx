import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, TextInput, View, ViewStyle } from 'react-native';

import { colors, fontFamily, radius, spacing } from '@/src/design-system/tokens';

import { CircleButton } from './CircleButton';
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

  return (
    <View style={[styles.wrap, explore && styles.wrapExplore, style]}>
      <Pressable
        accessibilityRole={readOnly ? 'button' : undefined}
        accessibilityLabel={readOnly ? placeholder : undefined}
        onPress={onPress}
        disabled={!readOnly}
        style={[styles.field, explore && styles.fieldExplore, onFilterPress ? styles.fieldWithFilter : null]}
      >
        <Ionicons name="search" size={SEARCH_ICON} color={PLACEHOLDER_INK} />
        {readOnly ? (
          <View style={styles.readOnlyLabel} pointerEvents="none">
            <PlaceholderText>{value || placeholder}</PlaceholderText>
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
            style={[styles.input, explore && styles.inputExplore]}
          />
        )}
        {actionLabel && onAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={actionAccessibilityLabel ?? actionLabel}
            onPress={onAction}
            style={({ pressed }) => [
              styles.action,
              explore && styles.actionExplore,
              pressed && styles.actionPressed,
            ]}
          >
            <Text style={[styles.actionLabel, explore && styles.actionLabelExplore]}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </Pressable>

      {/* The approved frame tucks the filter disc inside the field's right edge, not beside it.
          It sits over the field rather than within it so its press area stays its own. */}
      {onFilterPress ? (
        <CircleButton
          icon="options-outline"
          accessibilityLabel="Filters"
          tone="dark"
          size={FILTER_SIZE}
          iconSize={20}
          onPress={onFilterPress}
          style={styles.filter}
        />
      ) : null}
    </View>
  );
}

function PlaceholderText({ children }: { children: string }) {
  return (
    <TextInput
      editable={false}
      pointerEvents="none"
      value={children}
      style={[styles.input, styles.readOnlyInput]}
    />
  );
}

/**
 * From the approved frame "01 — Home" (node "Search bar"): a 56pt field with the search glyph
 * 22px in, the placeholder starting at 56, and a 46px filter disc inset 5 from the right edge.
 */
const FIELD_HEIGHT = 56;
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
    fontFamily: fontFamily.regular,
    fontSize: PLACEHOLDER_FONT_SIZE,
    color: colors.text.primary,
    // Web needs the outline removed explicitly; RN ignores it.
    outlineStyle: 'none',
  } as never,
  readOnlyLabel: {
    flex: 1,
  },
  readOnlyInput: {
    color: PLACEHOLDER_INK,
  },
  filter: {
    position: 'absolute',
    right: FILTER_INSET,
    top: (FIELD_HEIGHT - FILTER_SIZE) / 2,
  },
  action: {
    height: ACTION_HEIGHT,
    borderRadius: ACTION_HEIGHT / 2,
    paddingHorizontal: 18,
    marginRight: -(FIELD_PADDING - ACTION_INSET),
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
