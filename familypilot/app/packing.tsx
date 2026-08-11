import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/src/components/ui/BackButton';
import { Card, EmptyState, Text } from '@/src/components/ui';
import { DeferredPilotGate } from '@/src/components/shared/DeferredPilotGate';
import { timing } from '@/src/design-system/animations/presets';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { usePackingList } from '@/src/hooks/use-queries';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { PackingItem } from '@/src/types';

export default function PackingScreen() {
  return (
    <DeferredPilotGate feature="packing" title="Packing lists coming later">
      <PackingScreenContent />
    </DeferredPilotGate>
  );
}

function PackingScreenContent() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: initialItems, isLoading } = usePackingList();
  const [items, setItems] = useState<PackingItem[] | undefined>(initialItems);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (initialItems) setItems(initialItems);
  }, [initialItems]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)' as never);
    }
  };

  const toggleItem = (id: string) => {
    setItems((prev) =>
      prev?.map((item) => (item.id === id ? { ...item, packed: !item.packed } : item)),
    );
  };

  const categories = [...new Set(items?.map((i) => i.category) ?? [])];
  const packedCount = items?.filter((i) => i.packed).length ?? 0;
  const totalCount = items?.length ?? 0;
  const allPacked = totalCount > 0 && packedCount === totalCount;

  if (!isLoading && (!items || items.length === 0)) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <BackButton onPress={handleBack} />
        <EmptyState
          icon="bag-outline"
          title="No active trip"
          message="Start planning a holiday to generate a packing list."
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackButton onPress={handleBack} />
        <View style={styles.headerText}>
          <Text variant="heading1">Packing list</Text>
          <Text variant="bodySmall" color={colors.text.secondary}>
            Tenerife · 7 nights · 2 children
          </Text>
        </View>
      </View>

      {allPacked ? (
        <View style={styles.completeBanner}>
          <Ionicons name="checkmark-circle" size={20} color={colors.secondary[600]} />
          <Text variant="bodySmall" color={colors.secondary[600]}>
            All packed — you&apos;re ready to go
          </Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.content}>
        {categories.map((category) => (
          <View key={category} style={styles.section}>
            <Text variant="heading3" style={styles.sectionTitle}>
              {category}
            </Text>
            {items
              ?.filter((i) => i.category === category)
              .map((item) => (
                <PackingRow
                  key={item.id}
                  item={item}
                  onToggle={() => toggleItem(item.id)}
                  reducedMotion={reducedMotion}
                />
              ))}
          </View>
        ))}
      </ScrollView>

      <Card style={[styles.summary, { marginBottom: insets.bottom + spacing.md }]}>
        <Text variant="bodySmall" color={colors.text.secondary}>
          {packedCount} of {totalCount} items packed
        </Text>
      </Card>
    </View>
  );
}

function PackingRow({
  item,
  onToggle,
  reducedMotion,
}: {
  item: PackingItem;
  onToggle: () => void;
  reducedMotion: boolean;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    if (!reducedMotion) {
      scale.value = withTiming(0.96, timing.fast);
      setTimeout(() => {
        scale.value = withTiming(1, timing.normal);
      }, 100);
    }
    onToggle();
  };

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: item.packed }}
      accessibilityLabel={`${item.name}, ${item.packed ? 'packed' : 'not packed'}`}
    >
      <Animated.View style={[styles.itemRow, item.packed && styles.itemRowPacked, animatedStyle]}>
        <Ionicons
          name={item.packed ? 'checkmark-circle' : 'ellipse-outline'}
          size={24}
          color={item.packed ? colors.secondary[500] : colors.border}
        />
        <Text variant="body" style={[styles.itemName, item.packed && styles.itemPacked]}>
          {item.name}
        </Text>
        <Text variant="bodySmall" color={colors.text.secondary}>
          ×{item.quantity}
        </Text>
      </Animated.View>
    </Pressable>
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
  completeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.screenPadding,
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.secondary[50],
    borderRadius: radius.md,
  },
  content: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: spacing['3xl'],
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
    paddingHorizontal: spacing.sm,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    minHeight: 44,
  },
  itemRowPacked: {
    backgroundColor: colors.secondary[50],
    borderRadius: radius.sm,
  },
  itemName: {
    flex: 1,
  },
  itemPacked: {
    textDecorationLine: 'line-through',
    color: colors.text.secondary,
  },
  summary: {
    marginHorizontal: spacing.screenPadding,
  },
});
