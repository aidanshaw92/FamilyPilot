import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from '@/src/components/ui/PressableScale';
import { FadeInView } from '@/src/components/ui/FadeInView';
import { Text } from '@/src/components/ui/Text';
import { VenueImage } from '@/src/components/ui/VenueImage';
import { colors, radius, spacing } from '@/src/design-system/tokens';
import { FocusedRecommendation } from '@/src/types/day-request';
import { formatArrivalTime } from '@/src/utils/clock-format';

interface Props { recommendation: FocusedRecommendation; variant?: 'hero' | 'carousel'; index?: number }
export function FocusedRecommendationCard({ recommendation, variant = 'carousel', index = 0 }: Props) {
  const router = useRouter();
  const isHero = variant === 'hero';
  return <FadeInView delay={index * 60}>
    <PressableScale onPress={() => router.push(`/venue/${recommendation.venueId}` as never)} style={[styles.card, isHero && styles.hero]} accessibilityRole="button" accessibilityLabel={`${recommendation.venueName}, ${recommendation.fit}`}>
      <View style={styles.imageWrap}>
        <VenueImage uri={recommendation.imageUrl} category={recommendation.category} alt={recommendation.venueName} style={[styles.image, isHero && styles.heroImage]} borderRadius={radius.lg} />
        {isHero ? <>
          <LinearGradient colors={['transparent', 'rgba(18,24,27,0.82)']} style={styles.scrim} pointerEvents="none" />
          <View style={styles.overlayCopy}><Text variant="caption" color={colors.text.inverse}>{recommendation.category}</Text><Text variant="heading2" color={colors.text.inverse} style={styles.venueName}>{recommendation.venueName}</Text><View style={styles.rating}><Ionicons name="star" size={14} color="#FFD166" /><Text variant="caption" color={colors.text.inverse}>{recommendation.fit}</Text><Text variant="caption" color="rgba(255,255,255,0.76)">{recommendation.driveMinutes} min away</Text></View></View>
          <View style={styles.arrow}><Ionicons name="arrow-forward" size={22} color={colors.text.primary} /></View>
        </> : null}
      </View>
      {!isHero ? <View style={styles.content}><Text variant="heading3" numberOfLines={1}>{recommendation.venueName}</Text><Text variant="bodySmall" style={styles.fit}>{recommendation.fit}</Text></View> : null}
      {isHero ? <View style={styles.detailRow}><Text variant="bodySmall" numberOfLines={1} style={styles.reason}>{recommendation.reasons[0]?.text ?? 'A thoughtful option for your family'}</Text><Text variant="caption" color={colors.text.secondary}>Arrive by {formatArrivalTime(recommendation.driveMinutes)}</Text></View> : null}
    </PressableScale>
  </FadeInView>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.borderLight },
  hero: { marginBottom: spacing.xl }, imageWrap: { position: 'relative' }, image: { width: '100%', height: 150 }, heroImage: { height: 310 }, scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '68%' }, overlayCopy: { position: 'absolute', left: spacing.lg, right: 72, bottom: spacing.lg, gap: 5 }, venueName: { fontSize: 25, lineHeight: 30 }, rating: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs }, arrow: { position: 'absolute', right: spacing.lg, bottom: spacing.lg, width: 48, height: 48, borderRadius: radius.full, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, content: { padding: spacing.md }, fit: { color: colors.secondary[600], marginTop: spacing.xs }, detailRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: 4 }, reason: { flex: 1 },
});
