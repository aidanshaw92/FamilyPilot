import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { colors, radius, shadows, spacing } from '@/src/design-system/tokens';
import { FamilyScore, VenueDetail } from '@/src/types';
import {
  formatTerrainLabel,
  getMatchClassification,
  getQualitativeRating,
} from '@/src/utils/family-match-classification';

import { DataTrustBadge } from './DataTrustBadge';
import { formatFamilyMatchSecondary } from './family-match-label';
import { Text } from './Text';

const FACILITY_LABELS: Record<string, string> = {
  cafe: 'Café',
  toilets: 'Toilets',
  baby_changing: 'Baby changing',
  playground: 'Playground',
  parking: 'Parking',
  highchairs: 'High chairs',
  pushchair_friendly: 'Pushchair friendly',
};

interface FamilyMatchPanelProps {
  familyScore: FamilyScore;
  venue?: VenueDetail;
  compact?: boolean;
}

export function FamilyMatchPanel({ familyScore, venue, compact = false }: FamilyMatchPanelProps) {
  const classification = getMatchClassification(familyScore.score);
  const facilityLabels = (venue?.facilities ?? [])
    .slice(0, 4)
    .map((f) => FACILITY_LABELS[f] ?? f.replace(/_/g, ' '))
    .join(' · ');

  return (
    <View style={[styles.panel, compact && styles.compact]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text variant="heading2">{classification}</Text>
          <Text variant="bodySmall" color={colors.text.secondary} style={styles.secondaryScore}>
            {formatFamilyMatchSecondary(familyScore.score)}
          </Text>
        </View>
      </View>

      <Text variant="heading3" style={styles.sectionHeading}>
        Why it suits your family
      </Text>

      {familyScore.explanation.length > 0 ? (
        <View style={styles.reasons}>
          {familyScore.explanation.map((reason) => (
            <View key={reason} style={styles.reasonRow}>
              <Ionicons name="checkmark-circle" size={16} color={colors.secondary[500]} />
              <Text variant="bodySmall" style={styles.reasonText}>
                {reason}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {venue && !compact ? (
        <View style={styles.suitabilityGrid}>
          <SuitabilityRow
            label="Age suitability"
            value={getQualitativeRating(familyScore.factors.ageSuitability)}
          />
          <SuitabilityRow
            label="Travel time"
            value={`${venue.driveMinutes} minutes — within your preferred range`}
          />
          {facilityLabels ? (
            <SuitabilityRow label="Facilities" value={facilityLabels} />
          ) : null}
          <SuitabilityRow label="Terrain" value={formatTerrainLabel(venue.terrain)} />
          <SuitabilityRow
            label="Budget"
            value={getQualitativeRating(familyScore.factors.budgetFit) === 'Excellent'
              ? 'Within your usual range'
              : 'May be above your usual range'}
          />
        </View>
      ) : null}

      {venue?.goodToKnow && venue.goodToKnow.length > 0 ? (
        <View style={styles.goodToKnow}>
          <Text variant="heading3" style={styles.goodToKnowTitle}>
            Good to know
          </Text>
          {venue.goodToKnow.map((item) => (
            <View key={item} style={styles.cautionRow}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.warning[600]} />
              <Text variant="bodySmall" style={styles.cautionText}>
                {item}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {venue ? (
        <View style={styles.trustRow}>
          <DataTrustBadge variant="estimated" label="Estimated family cost" />
          <DataTrustBadge variant="opening_hours" />
        </View>
      ) : null}
    </View>
  );
}

function SuitabilityRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.suitabilityRow}>
      <Text variant="bodySmall" color={colors.text.secondary} style={styles.suitabilityLabel}>
        {label}
      </Text>
      <Text variant="bodySmall" style={styles.suitabilityValue}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.card,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  compact: {
    padding: spacing.md,
  },
  header: {
    marginBottom: spacing.lg,
  },
  headerText: {
    gap: spacing.xs,
  },
  secondaryScore: {
    marginTop: spacing.xs,
  },
  sectionHeading: {
    marginBottom: spacing.md,
  },
  reasons: {
    marginBottom: spacing.lg,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  reasonText: {
    flex: 1,
    color: colors.text.primary,
    lineHeight: 20,
  },
  suitabilityGrid: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  suitabilityRow: {
    gap: spacing.xs,
  },
  suitabilityLabel: {
    fontFamily: 'Inter_600SemiBold',
  },
  suitabilityValue: {
    color: colors.text.primary,
    lineHeight: 20,
  },
  goodToKnow: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.lg,
    marginBottom: spacing.md,
  },
  goodToKnowTitle: {
    marginBottom: spacing.md,
  },
  cautionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  cautionText: {
    flex: 1,
    color: colors.warning[600],
    lineHeight: 20,
  },
  trustRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
