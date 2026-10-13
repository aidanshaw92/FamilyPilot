import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Button, Skeleton, Text } from '@/src/components/ui';
import { colors, fontFamily, radius, spacing } from '@/src/design-system/tokens';
import { HalfwayResult } from '@/src/services/planning/meet-halfway';
import { familyPhrase } from '@/src/services/planning/meet-halfway';

/** What the sheet says while it is still looking: the two areas are already on the map, and this is the shape of what is coming. */
export function LoadingRecommendations() {
  return (
    <View style={styles.block} testID="halfway-loading" accessibilityLiveRegion="polite" accessibilityLabel="Looking at places between your two homes">
      <Text variant="bodySmall" color={colors.text.secondary}>Looking at places between your two homes…</Text>
      {[0, 1].map((row) => (
        <View key={row} style={styles.skeletonRow}>
          <Skeleton width={96} height={96} borderRadius={radius.lg} />
          <View style={styles.skeletonLines}>
            <Skeleton width="88%" height={12} />
            <Skeleton width="58%" height={12} />
            <Skeleton width="100%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** A failed lookup: said plainly, with the one thing to do. Nothing was changed. */
export function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={[styles.block, styles.centre]} testID="halfway-error" accessibilityLiveRegion="polite">
      <View style={styles.well}><Ionicons name="information-circle-outline" size={30} color={colors.action} /></View>
      <Text variant="heading3" style={styles.centred}>We couldn’t load places</Text>
      <Text variant="bodySmall" color={colors.text.secondary} style={styles.centred}>Check your connection and try again. Nothing was changed.</Text>
      <Button label="Try again" variant="secondary" size="sm" onPress={onRetry} testID="halfway-retry" />
    </View>
  );
}

/**
 * No place works for both, with the engine's own reasons (how many were too far, shut, or confirmed to lack something) and
 * the way out: another day or time, or, where the only thing in the way was the start, the earliest start that works.
 */
export function NoSuitablePlaces({ result, other, onChangeWhen, onStartAt }: { result: HalfwayResult; other: string; onChangeWhen: () => void; onStartAt: (time: string) => void }) {
  const { excluded } = result;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return (
    <View style={styles.block} testID="halfway-empty">
      <Text variant="heading3">No place works for both of you yet</Text>
      {result.considered === 0 ? (
        <Text variant="bodySmall" color={colors.text.secondary}>We don’t have any places on record between your two homes yet.</Text>
      ) : null}
      {result.earliestArrival ? (
        <>
          <Text variant="bodySmall" color={colors.text.secondary}>
            That start has already gone for one of you. The earliest you could both be there is {result.earliestArrival}.
          </Text>
          <Button label={`Start at ${result.earliestArrival}`} onPress={() => onStartAt(result.earliestArrival!)} testID="halfway-earliest" />
        </>
      ) : (
        <>
          {excluded.journey > 0 ? (
            <Text variant="bodySmall" color={colors.text.secondary}>
              {plural(excluded.journey, 'place is', 'places are')} further than one of you wants to drive.
            </Text>
          ) : null}
          {excluded.closed > 0 ? <Text variant="bodySmall" color={colors.text.secondary}>{excluded.closed} {excluded.closed === 1 ? 'is' : 'are'} shut at that time.</Text> : null}
          {excluded.requirements > 0 ? (
            <Text variant="bodySmall" color={colors.text.secondary}>
              {excluded.requirements} {excluded.requirements === 1 ? 'is' : 'are'} ruled out: they’re confirmed to lack something one of you needs, or their age policy doesn’t admit you.
            </Text>
          ) : null}
          <Text variant="bodySmall" color={colors.text.secondary}>Try another day or time.</Text>
          <Button label="Change day or time" onPress={onChangeWhen} testID="halfway-change-when" />
        </>
      )}
      {!result.otherKnown.children && !result.otherKnown.routines ? (
        <Text variant="caption" color={colors.text.tertiary}>
          We only know where {familyPhrase('other', other)} sets off from, so only the journeys, opening hours and what you need were checked.
        </Text>
      ) : null}
    </View>
  );
}

/** Home's places were used because the search between the homes failed: said at the top, in amber, never hidden. */
export function FallbackBanner({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.banner, compact && styles.bannerCompact]} testID="halfway-fallback" accessibilityLiveRegion="polite">
      <Ionicons name="information-circle-outline" size={18} color={colors.warning[600]} style={{ marginTop: 1 }} />
      {compact ? (
        // Over the map the banner is one short paragraph, so the map stays the picture.
        <Text style={[styles.bannerBody, styles.bannerBodyCompact]} numberOfLines={3}>
          <Text style={[styles.bannerTitle, styles.bannerBodyCompact]}>We couldn’t search between your homes just now. </Text>
          These are the places already on Home; there may be better ones in between.
        </Text>
      ) : (
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle}>We couldn’t search between your homes just now</Text>
          <Text style={styles.bannerBody}>These are the places already on Home. There may be better ones in between.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 12, paddingBottom: 4 },
  centre: { alignItems: 'center', paddingTop: 12 },
  centred: { textAlign: 'center', maxWidth: 300 },
  well: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.actionSoft, alignItems: 'center', justifyContent: 'center' },
  skeletonRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  skeletonLines: { flex: 1, gap: 10 },
  banner: { flexDirection: 'row', gap: 10, backgroundColor: colors.warning[50], borderColor: colors.warning[100], borderWidth: 1, borderRadius: radius.lg, padding: 12 },
  bannerCompact: { paddingVertical: 8, paddingHorizontal: 10, gap: 8, backgroundColor: 'rgba(251,240,221,0.96)' },
  bannerBodyCompact: { flex: 1, fontSize: 12, lineHeight: 16 },
  bannerTitle: { fontFamily: fontFamily.bold, fontSize: 13, lineHeight: 18, color: colors.warning[600] },
  bannerBody: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 19, color: colors.ink },
});
