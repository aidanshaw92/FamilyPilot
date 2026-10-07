import { useEffect } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Chip, Text, CHIP_GAP } from '@/src/components/ui';
import { minTarget } from '@/src/components/ui/touch';
import { timing } from '@/src/design-system/animations/presets';
import { colors, radius, shadows, spacing } from '@/src/design-system/tokens';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useFiltersStore } from '@/src/stores/filters-store';
import { RESTAURANT_FILTER_OPTIONS } from '@/src/utils/filter-restaurants';
import {
  BUDGET_FILTER_OPTIONS,
  DRIVE_FILTER_OPTIONS,
  FILTER_SHEET_OPTIONS,
  FOOD_SHEET_OPTIONS,
} from '@/src/utils/filter-venues';
import { useFamilyProfile } from '@/src/hooks/use-queries';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function Backdrop({ onClose }: { onClose: () => void }) {
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    opacity.value = withTiming(1, timing.normal);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <AnimatedPressable
      style={[styles.backdrop, animatedStyle]}
      onPress={onClose}
      accessibilityRole="button"
      accessibilityLabel="Close filters"
    />
  );
}

interface FilterSheetProps {
  visible: boolean;
  onClose: () => void;
  /**
   * `home` offers only the filters that make sense on Home's one deck: the practical needs and the food groups.
   * Travel time and budget are Explore's "for this search only" controls and would be confusing there.
   */
  scope?: 'explore' | 'home';
  /**
   * False when almost no place has a price on record: the Budget group and the "Free" filter are then left out, because they
   * could only return an empty list (see `hasPriceCoverage`). Defaults to true.
   */
  priceFiltersAvailable?: boolean;
}

export function FilterSheet({ visible, onClose, scope = 'explore', priceFiltersAvailable = true }: FilterSheetProps) {
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

  // The sheet is a Modal, which on the web mounts beside the app rather than over it, so the page behind
  // stays in the tab order and the reading order unless it is made inert while the sheet is open.
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible || typeof document === 'undefined') return;
    const root = document.getElementById('root');
    if (!root) return;
    root.setAttribute('inert', '');
    root.setAttribute('aria-hidden', 'true');
    return () => {
      root.removeAttribute('inert');
      root.removeAttribute('aria-hidden');
    };
  }, [visible]);

  const isRestaurantMode = scope === 'explore' && categoryFilter === 'restaurants';
  const profileDrive = profile?.maxDriveMinutes ?? 30;

  const handleReset = () => {
    if (scope === 'home') {
      useFiltersStore.getState().clearAdvancedFilters();
    } else if (isRestaurantMode) {
      setExploreMaxDrive('any');
      setExploreBudget('any');
      useFiltersStore.getState().clearAdvancedFilters();
    } else {
      resetExploreFilters();
    }
  };

  // Restaurants carry their own prices; for places the filters need prices to exist (see `hasPriceCoverage`).
  const showPrices = priceFiltersAvailable || isRestaurantMode;

  const facilityOptions = isRestaurantMode
    ? [
        { id: 'facilities', label: 'Family facilities', options: RESTAURANT_FILTER_OPTIONS.slice(0, 9) },
        {
          id: 'dietary',
          label: 'Dietary preferences',
          options: RESTAURANT_FILTER_OPTIONS.slice(9),
        },
      ]
    : [
        { id: 'general', label: 'More filters', options: showPrices ? FILTER_SHEET_OPTIONS : FILTER_SHEET_OPTIONS.filter((o) => o.id !== 'free') },
        { id: 'food', label: 'Food nearby', options: FOOD_SHEET_OPTIONS },
      ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Backdrop onClose={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text variant="heading2">Filters</Text>
          <Pressable
            onPress={handleReset}
            hitSlop={8}
            style={minTarget(20)}
            accessibilityRole="button"
            accessibilityLabel="Reset filters"
          >
            <Text variant="link">
              Reset
            </Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {scope === 'explore' ? (
            <>
              <Text variant="bodySmall" color={colors.text.secondary} style={styles.groupLabel}>
                Travel time from home
              </Text>
              <Text variant="caption" color={colors.text.tertiary} style={styles.groupHint}>
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

              {showPrices ? (
                <>
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
                </>
              ) : (
                <Text variant="caption" color={colors.text.tertiary} style={styles.groupHint} testID="price-filters-note">
                  Price filters appear once prices are confirmed for more places.
                </Text>
              )}
            </>
          ) : null}

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

        <Button label="Show results" onPress={onClose} size="lg" fullWidth style={styles.applyButton} />
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
    gap: CHIP_GAP,
    marginBottom: spacing.md,
  },
  applyButton: {
    marginTop: spacing.sm,
  },
});
