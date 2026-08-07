import { Stack } from 'expo-router';

export default function InternalLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitle: 'Internal',
        animation: 'slide_from_right',
      }}
    />
  );
}
