import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip, Text } from '@/src/components/ui';
import { colors, radius, shadows, spacing } from '@/src/design-system/tokens';
import { useFiltersStore } from '@/src/stores/filters-store';
import { RESTAURANT_FILTER_OPTIONS } from '@/src/utils/filter-restaurants';
import {
  BUDGET_FILTER_OPTIONS,
  DRIVE_FILTER_OPTIONS,
  FILTER_SHEET_OPTIONS,
} from '@/src/utils/filter-venues';
import { useFamilyProfile } from '@/src/hooks/use-queries';

interface FilterSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function FilterSheet({ visible, onClose }: FilterSheetProps) {
  const insets = useSafeAreaInsets();
  const { data: profile } = useFamilyProfile();
  const {
    categoryFilter,
    exploreMaxDrive,
    exploreBudget,
    advancedFilters,
    setExploreMaxDrive,
    setExploreBudget,
    toggleAdvancedFilter,
    resetExploreFilters,
  } = useFiltersStore();

  const isRestaurantMode = categoryFilter === 'restaurants';
  const profileDrive = profile?.maxDriveMinutes ?? 30;

  const handleReset = () => {
    if (isRestaurantMode) {
      setExploreMaxDrive('any');
      setExploreBudget('any');
      useFiltersStore.getState().clearAdvancedFilters();
    } else {
      resetExploreFilters();
    }
  };

  const facilityOptions = isRestaurantMode
    ? [
        { id: 'facilities', label: 'Family facilities', options: RESTAURANT_FILTER_OPTIONS.slice(0, 9) },
        {
          id: 'dietary',
          label: 'Dietary preferences',
          options: RESTAURANT_FILTER_OPTIONS.slice(9),
        },
      ]
    : [{ id: 'general', label: 'More filters', options: FILTER_SHEET_OPTIONS }];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close filters" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text variant="heading2">Filters</Text>
          <Pressable onPress={handleReset} hitSlop={8}>
            <Text variant="bodySmall" color={colors.primary[500]}>
              Reset
            </Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <Text variant="bodySmall" color={colors.text.secondary} style={styles.groupLabel}>
            Travel time from home
          </Text>
          <Text variant="caption" color={colors.text.tertiary} style={styles.groupHint}>
            Your profile default is {profileDrive} minutes — change here for this search only
          </Text>
          <View style={styles.chipWrap}>
            {DRIVE_FILTER_OPTIONS.map((option) => (
              <Chip
                key={String(option.id)}
                label={option.label}
                active={exploreMaxDrive === option.id}
                onPress={() => setExploreMaxDrive(option.id)}
              />
            ))}
          </View>

          <Text variant="bodySmall" color={colors.text.secondary} style={styles.groupLabel}>
            Budget
          </Text>
          <View style={styles.chipWrap}>
            {BUDGET_FILTER_OPTIONS.filter((option) =>
              isRestaurantMode ? option.id !== 'free' : true,
            ).map((option) => (
              <Chip
                key={option.id}
                label={option.label}
                active={exploreBudget === option.id}
                onPress={() => setExploreBudget(option.id)}
              />
            ))}
          </View>

          {facilityOptions.map((group) => (
            <View key={group.id}>
              <Text variant="bodySmall" color={colors.text.secondary} style={styles.groupLabel}>
                {group.label}
              </Text>
              <View style={styles.chipWrap}>
                {group.options.map((filter) => (
                  <Chip
                    key={filter.id}
                    label={filter.label}
                    active={advancedFilters.includes(filter.id)}
                    onPress={() => toggleAdvancedFilter(filter.id)}
                  />
                ))}
              </View>
            </View>
          ))}
        </ScrollView>

        <Pressable style={styles.applyButton} onPress={onClose} accessibilityRole="button">
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
    maxHeight: '85%',
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
  groupLabel: {
    fontFamily: 'Inter_600SemiBold',
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  groupHint: {
    marginBottom: spacing.md,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
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
