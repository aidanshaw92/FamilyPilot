import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { Text } from '@/src/components/ui';
import { colors, spacing } from '@/src/design-system/tokens';
import { EnrichmentQueueItem, EnrichmentStats } from '@/src/types/enrichment';
import { BatchDraftProgress } from '@/src/types/ai-enrichment';
import { enrichmentApi } from '@/src/services/enrichment/enrichment-api-client';
import { getEnrichmentQueueEmptyMessage } from '@/src/utils/enrichment-queue-ui';

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'provider_only', label: 'Provider only' },
  { id: 'ai_draft', label: 'AI draft' },
  { id: 'enriched', label: 'Enriched' },
  { id: 'verified', label: 'Verified' },
] as const;

const DEFAULT_BETA = { lat: '51.643', lng: '-0.360', radius: '15', label: 'Bushey' };

export default function EnrichmentQueueScreen() {
  const router = useRouter();
  const [items, setItems] = useState<EnrichmentQueueItem[]>([]);
  const [stats, setStats] = useState<EnrichmentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [generatingBatch, setGeneratingBatch] = useState(false);
  const [regeneratingLegacyBatch, setRegeneratingLegacyBatch] = useState(false);
  const [batchSummary, setBatchSummary] = useState('');
  const [batchProgress, setBatchProgress] = useState<BatchDraftProgress | null>(null);
  const [legacyBatchProgress, setLegacyBatchProgress] = useState<BatchDraftProgress | null>(null);
  const [batchCancelRef, setBatchCancelRef] = useState<{ cancelled: boolean } | null>(null);
  const [legacyBatchCancelRef, setLegacyBatchCancelRef] = useState<{ cancelled: boolean } | null>(null);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState('nearest');
  const [betaLat, setBetaLat] = useState(DEFAULT_BETA.lat);
  const [betaLng, setBetaLng] = useState(DEFAULT_BETA.lng);
  const [betaRadius, setBetaRadius] = useState(DEFAULT_BETA.radius);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const betaParams = {
        betaLat: Number(betaLat),
        betaLng: Number(betaLng),
        betaRadiusKm: Number(betaRadius),
      };
      const [{ items: queueItems }, { stats: s }] = await Promise.all([
        enrichmentApi.getQueue({
          status: statusFilter === 'all' ? undefined : statusFilter,
          sort,
          ...betaParams,
        }),
        enrichmentApi.getStats(betaParams),
      ]);
      setItems(queueItems);
      setStats(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, sort, betaLat, betaLng, betaRadius]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    setError('');
    try {
      await enrichmentApi.syncArea(Number(betaLat), Number(betaLng), Number(betaRadius));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleGenerateBatch = async () => {
    setGeneratingBatch(true);
    setError('');
    setBatchSummary('');
    setBatchProgress(null);
    const cancelState = { cancelled: false };
    setBatchCancelRef(cancelState);
    try {
      const result = await enrichmentApi.generateDraftBatch({
        batchSize: 10,
        betaLat: Number(betaLat),
        betaLng: Number(betaLng),
        betaRadiusKm: Number(betaRadius),
        concurrency: 2,
        shouldContinue: () => !cancelState.cancelled,
        onProgress: (progress) => setBatchProgress(progress),
      });
      setBatchSummary(
        `Batch: ${result.succeeded}/${result.processed} succeeded · est. $${result.estimatedCostUsd.toFixed(4)}`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Batch generation failed');
    } finally {
      setGeneratingBatch(false);
      setBatchCancelRef(null);
    }
  };

  const handleCancelBatch = () => {
    if (batchCancelRef) batchCancelRef.cancelled = true;
  };

  const handleRegenerateLegacyBatch = async () => {
    setRegeneratingLegacyBatch(true);
    setError('');
    setBatchSummary('');
    setLegacyBatchProgress(null);
    const cancelState = { cancelled: false };
    setLegacyBatchCancelRef(cancelState);
    try {
      const result = await enrichmentApi.regenerateLegacyDraftBatch({
        batchSize: 10,
        concurrency: 2,
        shouldContinue: () => !cancelState.cancelled,
        onProgress: (progress) => setLegacyBatchProgress(progress),
      });
      setBatchSummary(
        `Legacy regeneration: ${result.succeeded}/${result.processed} succeeded · est. $${result.estimatedCostUsd.toFixed(4)}`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Legacy draft regeneration failed');
    } finally {
      setRegeneratingLegacyBatch(false);
      setLegacyBatchCancelRef(null);
    }
  };

  const handleCancelLegacyBatch = () => {
    if (legacyBatchCancelRef) legacyBatchCancelRef.cancelled = true;
  };

  const batchBusy = generatingBatch || regeneratingLegacyBatch;

  const statusBadge = (status: string) => {
    switch (status) {
      case 'ai_draft':
        return 'AI draft';
      case 'provider_only':
        return 'Provider only';
      case 'enriched':
        return 'Enriched';
      case 'verified':
        return 'Verified';
      default:
        return status.replace('_', ' ');
    }
  };

  const handleExport = async () => {
    try {
      const csv = await enrichmentApi.exportCsv();
      if (typeof window !== 'undefined') {
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'enrichment-export.csv';
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    }
  };

  const summary = useMemo(() => {
    if (!stats) return null;
    return `${stats.discovered} discovered · ${stats.providerOnly} provider only · ${stats.aiDraft ?? 0} AI draft · ${stats.enriched} enriched · ${stats.verified} verified · ${stats.awaitingReview} awaiting review`;
  }, [stats]);

  const emptyMessage = useMemo(
    () => getEnrichmentQueueEmptyMessage(statusFilter as 'all' | 'provider_only' | 'ai_draft' | 'enriched' | 'verified', stats),
    [statusFilter, stats],
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text variant="heading2">Venue enrichment queue</Text>
      <Text variant="bodySmall" color={colors.text.secondary}>
        Internal workflow — enrich live Google venues with FamilyPilot family metadata.
      </Text>

      {summary ? (
        <View style={styles.statsBox}>
          <Text variant="bodySmall">{summary}</Text>
        </View>
      ) : null}

      <Text variant="heading3">Beta area ({DEFAULT_BETA.label})</Text>
      <View style={styles.row}>
        <TextInput value={betaLat} onChangeText={setBetaLat} style={styles.smallInput} placeholder="Lat" />
        <TextInput value={betaLng} onChangeText={setBetaLng} style={styles.smallInput} placeholder="Lng" />
        <TextInput value={betaRadius} onChangeText={setBetaRadius} style={styles.smallInput} placeholder="km" />
      </View>
      <View style={styles.row}>
        <Pressable style={styles.actionBtn} onPress={() => void handleSync()} disabled={syncing}>
          <Text variant="bodySmall" color={colors.text.inverse}>
            {syncing ? 'Syncing…' : 'Sync Google places'}
          </Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, styles.secondaryBtn]} onPress={() => void handleExport()}>
          <Text variant="bodySmall">Export CSV</Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, styles.secondaryBtn]} onPress={() => void load()}>
          <Text variant="bodySmall">Refresh</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, styles.secondaryBtn]}
          onPress={() => void handleGenerateBatch()}
          disabled={batchBusy}
        >
          <Text variant="bodySmall">{generatingBatch ? 'Generating…' : 'Generate drafts (10)'}</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, styles.secondaryBtn]}
          onPress={() => void handleRegenerateLegacyBatch()}
          disabled={batchBusy}
        >
          <Text variant="bodySmall">
            {regeneratingLegacyBatch ? 'Regenerating legacy…' : 'Regenerate legacy drafts'}
          </Text>
        </Pressable>
        {generatingBatch && batchCancelRef ? (
          <Pressable style={[styles.actionBtn, styles.secondaryBtn]} onPress={handleCancelBatch}>
            <Text variant="bodySmall">Cancel batch</Text>
          </Pressable>
        ) : null}
        {regeneratingLegacyBatch && legacyBatchCancelRef ? (
          <Pressable style={[styles.actionBtn, styles.secondaryBtn]} onPress={handleCancelLegacyBatch}>
            <Text variant="bodySmall">Cancel legacy batch</Text>
          </Pressable>
        ) : null}
      </View>
      {batchProgress ? (
        <View style={styles.batchBox}>
          <Text variant="caption" color={colors.text.secondary}>
            Generating drafts — {batchProgress.completed} / {batchProgress.total} complete
            {batchProgress.current ? ` · ${batchProgress.current}` : ''}
          </Text>
          {batchProgress.results.map((r) => (
            <Text key={r.familypilotPlaceId} variant="caption" color={colors.text.tertiary}>
              {r.ok ? '✓' : '✗'} {r.name}
              {!r.ok && r.error ? ` — ${r.error}` : ''}
              {r.ok && r.evidenceStatus === 'provider_only' ? ' — no official source' : ''}
              {r.ok && r.evidenceStatus === 'evidence_backed' ? ' — evidence-backed' : ''}
            </Text>
          ))}
        </View>
      ) : null}
      {legacyBatchProgress ? (
        <View style={styles.batchBox}>
          <Text variant="caption" color={colors.text.secondary}>
            Regenerating legacy drafts — {legacyBatchProgress.completed} / {legacyBatchProgress.total} complete
            {legacyBatchProgress.current ? ` · ${legacyBatchProgress.current}` : ''}
          </Text>
          {legacyBatchProgress.results.map((r) => (
            <Text key={r.familypilotPlaceId} variant="caption" color={colors.text.tertiary}>
              {r.ok ? '✓' : '✗'} {r.name}
              {!r.ok && r.error ? ` — ${r.error}` : ''}
              {r.ok && r.evidenceStatus === 'evidence_backed' ? ' — evidence-backed' : ''}
              {r.ok && r.evidenceStatus === 'provider_only' ? ' — provider-only' : ''}
            </Text>
          ))}
        </View>
      ) : null}
      {batchSummary ? (
        <Text variant="caption" color={colors.text.secondary}>{batchSummary}</Text>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters}>
        {STATUS_FILTERS.map((f) => (
          <Pressable
            key={f.id}
            style={[styles.chip, statusFilter === f.id && styles.chipActive]}
            onPress={() => setStatusFilter(f.id)}
          >
            <Text variant="caption">{f.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.row}>
        {(['nearest', 'newest', 'alphabetical', 'priority'] as const).map((s) => (
          <Pressable key={s} style={[styles.chip, sort === s && styles.chipActive]} onPress={() => setSort(s)}>
            <Text variant="caption">{s}</Text>
          </Pressable>
        ))}
      </View>

      {error ? <Text variant="caption" color={colors.error[600]}>{error}</Text> : null}
      {loading ? <ActivityIndicator color={colors.primary[500]} /> : null}

      {items.map((item) => (
        <Pressable
          key={item.familypilotId}
          style={styles.card}
          onPress={() => router.push(`/internal/enrichment/${item.familypilotId}` as never)}
        >
          <Text variant="heading3">{item.name}</Text>
          <Text variant="caption" color={colors.text.secondary}>
            {item.category} · {statusBadge(item.enrichmentStatus)}
          </Text>
          <Text variant="caption" color={colors.text.tertiary} numberOfLines={1}>
            {item.familypilotId} · {item.externalId}
          </Text>
          {item.lastChecked ? (
            <Text variant="caption">Last checked: {item.lastChecked}</Text>
          ) : null}
        </Pressable>
      ))}

      {!loading && items.length === 0 ? (
        <Text variant="bodySmall" color={colors.text.secondary}>
          {emptyMessage}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding, gap: spacing.md, paddingBottom: 80 },
  statsBox: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  smallInput: {
    flex: 1,
    minWidth: 80,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.sm,
    backgroundColor: colors.surface,
  },
  actionBtn: {
    backgroundColor: colors.primary[500],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  secondaryBtn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  filters: { flexGrow: 0 },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
    backgroundColor: colors.surface,
  },
  chipActive: { borderColor: colors.primary[500], backgroundColor: colors.primary[50] },
  batchBox: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.xs,
  },
});
