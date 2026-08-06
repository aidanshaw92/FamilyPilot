import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip, Text } from '@/src/components/ui';
import { colors, radius, shadows, spacing } from '@/src/design-system/tokens';
import { useFiltersStore } from '@/src/stores/filters-store';
import { ADVANCED_FILTERS } from '@/src/utils/filter-venues';

interface FilterSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function FilterSheet({ visible, onClose }: FilterSheetProps) {
  const insets = useSafeAreaInsets();
  const { advancedFilters, toggleAdvancedFilter, clearAdvancedFilters } = useFiltersStore();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close filters" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text variant="heading2">More filters</Text>
          <Pressable onPress={clearAdvancedFilters} hitSlop={8}>
            <Text variant="bodySmall" color={colors.primary[500]}>
              Clear all
            </Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.chipWrap}>
            {ADVANCED_FILTERS.map((filter) => (
              <Chip
                key={filter.id}
                label={filter.label}
                active={advancedFilters.includes(filter.id)}
                onPress={() => toggleAdvancedFilter(filter.id)}
              />
            ))}
          </View>
        </ScrollView>

        <Pressable style={styles.applyButton} onPress={onClose}>
          <Text variant="heading3" color={colors.text.inverse}>
            Show results
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.md,
    maxHeight: '70%',
    ...shadows.bottomSheet,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  content: {
    paddingBottom: spacing.lg,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  applyButton: {
    backgroundColor: colors.primary[500],
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
});
