import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface BackButtonProps {
  onPress: () => void;
  color?: string;
}

export function BackButton({ onPress, color = '#1A1A2E' }: BackButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      style={styles.button}
      hitSlop={8}
    >
      <Ionicons name="chevron-back" size={24} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
