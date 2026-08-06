import { Pressable } from 'react-native';
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
      hitSlop={12}
    >
      <Ionicons name="chevron-back" size={28} color={color} />
    </Pressable>
  );
}
