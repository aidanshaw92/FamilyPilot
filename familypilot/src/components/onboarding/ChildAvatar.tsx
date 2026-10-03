import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui';
import { colors } from '@/src/design-system/tokens';

/**
 * The child, as Home's avatar draws a person: a near-black disc and a white initial. Before a name is
 * typed it is a plain person glyph, so the disc never shows a made-up letter.
 */
export function ChildAvatar({ name, size = 40 }: { name: string; size?: number }) {
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <View
      style={[styles.disc, { width: size, height: size, borderRadius: size / 2 }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {initial ? (
        <Text variant="label" color={colors.text.inverse} style={{ fontSize: size * 0.42, lineHeight: size * 0.5 }}>
          {initial}
        </Text>
      ) : (
        <Ionicons name="person" size={size * 0.46} color={colors.text.inverse} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  disc: { backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
});
