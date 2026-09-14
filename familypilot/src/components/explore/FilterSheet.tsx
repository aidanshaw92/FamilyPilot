import { Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet, Button, Chip, Text } from '@/src/components/ui';
import { colors, spacing } from '@/src/design-system/tokens';
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
        { id: 'dietary', label: 'Dietary preferences', options: RESTAURANT_FILTER_OPTIONS.slice(9) },
      ]
    : [{ id: 'general', label: 'Must-haves', options: FILTER_SHEET_OPTIONS }];

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Filters"
      footer={<Button label="Show results" onPress={onClose} size="lg" fullWidth />}
    >
      <Pressable
        onPress={handleReset}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Reset filters"
        style={styles.reset}
      >
        <Text variant="bodySmall" color={colors.text.primary} style={styles.resetLabel}>
          Reset all
        </Text>
      </Pressable>

      <Text variant="label" style={styles.groupLabel}>
        Travel time from home
      </Text>
      <Text variant="caption" style={styles.groupHint}>
        Your profile default is {profileDrive} minutes. Change here for this search only
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

      <Text variant="label" style={styles.groupLabel}>
        Budget
      </Text>
      <View style={styles.chipWrap}>
        {BUDGET_FILTER_OPTIONS.filter((option) => (isRestaurantMode ? option.id !== 'free' : true)).map(
          (option) => (
            <Chip
              key={option.id}
              label={option.label}
              active={exploreBudget === option.id}
              onPress={() => setExploreBudget(option.id)}
            />
          ),
        )}
      </View>

      {facilityOptions.map((group) => (
        <View key={group.id}>
          <Text variant="label" style={styles.groupLabel}>
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
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  reset: {
    alignSelf: 'flex-start',
    marginBottom: spacing.sm,
  },
  resetLabel: {
    fontFamily: 'Inter_600SemiBold',
    textDecorationLine: 'underline',
  },
  groupLabel: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  groupHint: {
    marginBottom: spacing.md,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
