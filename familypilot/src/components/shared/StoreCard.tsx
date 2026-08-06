import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { Text } from '@/src/components/ui/Text';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { StoreLocation } from '@/src/types';

const BRAND_COLORS: Record<string, string> = {
  tesco: '#00539F',
  sainsburys: '#F06C00',
  boots: '#0054A4',
  aldi: '#00005F',
  superdrug: '#EE0088',
};

interface StoreCardProps {
  store: StoreLocation;
}

export function StoreCard({ store }: StoreCardProps) {
  const handleDirections = () => {
    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.name)}`);
  };

  const handleCall = () => {
    if (store.phone) {
      void Linking.openURL(`tel:${store.phone}`);
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View
          style={[
            styles.brandDot,
            { backgroundColor: BRAND_COLORS[store.brand] ?? colors.primary[500] },
          ]}
        />
        <View style={styles.info}>
          <Text variant="heading3">{store.name}</Text>
          <View style={styles.meta}>
            <Ionicons name="car-outline" size={14} color={colors.text.secondary} />
            <Text variant="caption" color={colors.text.secondary}>
              {store.driveMinutes} min
            </Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: store.isOpen ? colors.secondary[100] : colors.error[100] },
              ]}
            >
              <Text
                variant="caption"
                color={store.isOpen ? colors.secondary[600] : colors.error[600]}
              >
                {store.isOpen ? `Open · Closes ${store.closesAt}` : 'Closed'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {store.categoriesAvailable ? (
        <Text variant="bodySmall" color={colors.text.secondary} style={styles.categories}>
          Usually stocks: {store.categoriesAvailable.join(', ')}
        </Text>
      ) : null}

      {store.stockNotes.map((note) => (
        <View key={note} style={styles.noteRow}>
          <Ionicons name="information-circle-outline" size={16} color={colors.text.secondary} />
          <Text variant="bodySmall" color={colors.text.secondary} style={styles.noteText}>
            {note}
          </Text>
        </View>
      ))}

      <Text variant="caption" color={colors.text.tertiary} style={styles.disclaimer}>
        Availability is estimated. Check with the retailer before travelling.
      </Text>

      <View style={styles.actions}>
        <Button label="Directions" onPress={handleDirections} style={styles.primaryAction} />
        {store.phone ? (
          <Button label="Call" variant="outline" onPress={handleCall} style={styles.secondaryAction} />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  brandDot: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    marginRight: spacing.md,
  },
  info: {
    flex: 1,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
    flexWrap: 'wrap',
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  categories: {
    marginBottom: spacing.sm,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  noteText: {
    flex: 1,
  },
  disclaimer: {
    marginTop: spacing.md,
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  primaryAction: {
    flex: 1,
  },
  secondaryAction: {
    minWidth: 88,
  },
});
