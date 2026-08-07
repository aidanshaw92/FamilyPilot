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
    void Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.name)}`,
    );
  };

  const handleCall = () => {
    if (store.phone) {
      void Linking.openURL(`tel:${store.phone}`);
    }
  };

  const statusLine = store.isOpen
    ? `Open until ${store.closesAt?.replace(':00', '') ?? 'closing time'}`
    : 'Closed';

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
          <Text variant="bodySmall" color={colors.text.secondary} style={styles.metaLine}>
            {store.driveMinutes} mins away · {statusLine}
          </Text>
        </View>
      </View>

      {store.categoriesAvailable && store.categoriesAvailable.length > 0 ? (
        <View style={styles.stockBlock}>
          <Text variant="bodySmall" color={colors.text.secondary}>
            Usually stocks:
          </Text>
          <Text variant="bodySmall" style={styles.stockList}>
            {store.categoriesAvailable.join(' · ')}
          </Text>
        </View>
      ) : null}

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
  metaLine: {
    marginTop: spacing.xs,
  },
  stockBlock: {
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  stockList: {
    color: colors.text.primary,
    lineHeight: 20,
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
