import { Ionicons } from '@expo/vector-icons';
import { ReactNode } from 'react';
import { LayoutAnimation, Platform, Pressable, StyleSheet, UIManager, View } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { VenueImage } from '@/src/components/ui/VenueImage';
import { colors, radius, spacing } from '@/src/design-system/tokens';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface ItinerarySlot {
  /** "Morning", "Afternoon" - the reference's time-of-day labels. */
  label: string;
  text: string;
}

interface ItineraryCardProps {
  /** "Stop 1", "Lunch" - the quiet line above the title. */
  eyebrow: string;
  title: string;
  imageUrl?: string;
  category?: string;
  expanded: boolean;
  onToggle: () => void;
  slots: ItinerarySlot[];
  /** Contextual guidance ("Home by 14:45, before the usual nap"). */
  note?: string;
  /** Edit controls, rendered inside the expanded body. */
  actions?: ReactNode;
}

/** The reference's Day 1 / Day 2 accordion: a thumbnail, two lines of type, a chevron,
 * and a body that opens to a short list of times. */
export function ItineraryCard({
  eyebrow,
  title,
  imageUrl,
  category,
  expanded,
  onToggle,
  slots,
  note,
  actions,
}: ItineraryCardProps) {
  const handleToggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.create(200, 'easeInEaseOut', 'opacity'));
    onToggle();
  };

  return (
    <View style={[styles.card, expanded && styles.cardExpanded]}>
      <Pressable
        onPress={handleToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${eyebrow}, ${title}`}
        style={styles.header}
      >
        <VenueImage
          uri={imageUrl}
          category={category}
          alt={title}
          style={styles.thumb}
          borderRadius={radius.lg}
        />
        <View style={styles.headerText}>
          <Text variant="caption" color={colors.text.tertiary}>
            {eyebrow}
          </Text>
          <Text variant="heading3" numberOfLines={2} style={styles.title}>
            {title}
          </Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.text.tertiary}
        />
      </Pressable>

      {expanded ? (
        <View style={styles.body}>
          {slots.map((slot) => (
            <View key={`${slot.label}-${slot.text}`} style={styles.slot}>
              <Text variant="caption" color={colors.text.tertiary}>
                {slot.label}
              </Text>
              <Text variant="body" style={styles.slotText}>
                {slot.text}
              </Text>
            </View>
          ))}

          {note ? (
            <View style={styles.note}>
              <Ionicons name="sparkles-outline" size={15} color={colors.text.secondary} />
              <Text variant="bodySmall" color={colors.text.secondary} style={styles.noteText}>
                {note}
              </Text>
            </View>
          ) : null}

          {actions ? <View style={styles.actions}>{actions}</View> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  cardExpanded: {
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
  },
  thumb: {
    width: 62,
    height: 62,
  },
  headerText: {
    flex: 1,
  },
  title: {
    marginTop: 2,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.lg,
  },
  slot: {
    gap: 2,
  },
  slotText: {
    lineHeight: 22,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSunken,
  },
  noteText: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
