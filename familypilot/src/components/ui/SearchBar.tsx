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
        style={styles.field}
      >
        <Ionicons name="search" size={19} color={colors.text.tertiary} />
        {readOnly ? (
          <View style={styles.readOnlyLabel} pointerEvents="none">
            <PlaceholderText>{value || placeholder}</PlaceholderText>
          </View>
        ) : (
          <TextInput
            accessibilityLabel={placeholder}
            placeholder={placeholder}
            placeholderTextColor={colors.text.tertiary}
            value={value}
            onChangeText={onChangeText}
            onSubmitEditing={onSubmit}
            returnKeyType="search"
            autoFocus={autoFocus}
            style={styles.input}
          />
        )}
      </Pressable>

      {onFilterPress ? (
        <CircleButton
          icon="options-outline"
          accessibilityLabel="Filters"
          tone={filterActive ? 'dark' : 'dark'}
          size={48}
          iconSize={21}
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

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: 56,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.text.primary,
    // Web needs the outline removed explicitly; RN ignores it.
    outlineStyle: 'none',
  } as never,
  readOnlyLabel: {
    flex: 1,
  },
  readOnlyInput: {
    color: colors.text.tertiary,
  },
  filter: {
    marginLeft: spacing.xs,
  },
});
