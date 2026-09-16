import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, TextInput, View, ViewStyle } from 'react-native';

import { colors, fontFamily, radius, spacing } from '@/src/design-system/tokens';

import { CircleButton } from './CircleButton';

interface SearchBarProps {
  value?: string;
  onChangeText?: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  /** When set, the whole bar is a button (a Home shortcut into Explore) rather than an input. */
  onPress?: () => void;
  onFilterPress?: () => void;
  filterActive?: boolean;
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
  onPress,
  onFilterPress,
  filterActive = false,
  style,
  autoFocus,
}: SearchBarProps) {
  const readOnly = Boolean(onPress);

  return (
    <View style={[styles.wrap, style]}>
      <Pressable
        accessibilityRole={readOnly ? 'button' : undefined}
        accessibilityLabel={readOnly ? placeholder : undefined}
        onPress={onPress}
        disabled={!readOnly}
        style={[styles.field, onFilterPress ? styles.fieldWithFilter : null]}
      >
        <Ionicons name="search" size={SEARCH_ICON} color={PLACEHOLDER_INK} />
        {readOnly ? (
          <View style={styles.readOnlyLabel} pointerEvents="none">
            <PlaceholderText>{value || placeholder}</PlaceholderText>
          </View>
        ) : (
          <TextInput
            accessibilityLabel={placeholder}
            placeholder={placeholder}
            placeholderTextColor={PLACEHOLDER_INK}
            value={value}
            onChangeText={onChangeText}
            onSubmitEditing={onSubmit}
            returnKeyType="search"
            autoFocus={autoFocus}
            style={styles.input}
          />
        )}
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
const PLACEHOLDER_FONT_SIZE = 15.5;
const PLACEHOLDER_INK = '#8C8C91';
const SEARCH_ICON = 22;
const FILTER_SIZE = 46;
const FILTER_INSET = 5;

const styles = StyleSheet.create({
  wrap: {
    height: FIELD_HEIGHT,
    justifyContent: 'center',
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: FIELD_HEIGHT,
    paddingHorizontal: 21,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    // The frame carries a soft drop shadow here rather than an outline.
    shadowColor: 'rgba(15, 15, 20, 1)',
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
});
