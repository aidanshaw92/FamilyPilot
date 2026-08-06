import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/src/components/ui/BackButton';
import { Card, Text } from '@/src/components/ui';
import { colors, spacing } from '@/src/design-system/tokens';
import { usePackingList } from '@/src/hooks/use-queries';

export default function PackingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: items } = usePackingList();

  const categories = [...new Set(items?.map((i) => i.category) ?? [])];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackButton onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text variant="heading1">Packing list</Text>
          <Text variant="bodySmall">Tenerife · 7 nights · 2 children</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {categories.map((category) => (
          <View key={category} style={styles.section}>
            <Text variant="heading3" style={styles.sectionTitle}>
              {category}
            </Text>
            {items
              ?.filter((i) => i.category === category)
              .map((item) => (
                <Pressable key={item.id} style={styles.itemRow}>
                  <Ionicons
                    name={item.packed ? 'checkmark-circle' : 'ellipse-outline'}
                    size={24}
                    color={item.packed ? colors.secondary[500] : colors.border}
                  />
                  <Text
                    variant="body"
                    style={[styles.itemName, item.packed && styles.itemPacked]}
                  >
                    {item.name}
                  </Text>
                  <Text variant="bodySmall" color={colors.text.tertiary}>
                    ×{item.quantity}
                  </Text>
                </Pressable>
              ))}
          </View>
        ))}
      </ScrollView>

      <Card style={[styles.summary, { marginBottom: insets.bottom + spacing.md }]}>
        <Text variant="bodySmall">
          {items?.filter((i) => i.packed).length ?? 0} of {items?.length ?? 0} items packed
        </Text>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: spacing['5xl'],
  },
  section: {
    marginBottom: spacing['2xl'],
  },
  sectionTitle: {
    marginBottom: spacing.lg,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  itemName: {
    flex: 1,
  },
  itemPacked: {
    textDecorationLine: 'line-through',
    color: colors.text.tertiary,
  },
  summary: {
    marginHorizontal: spacing.screenPadding,
  },
});
