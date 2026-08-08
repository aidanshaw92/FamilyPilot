import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { TriStateToggle } from '@/src/components/enrichment/TriStateToggle';
import { Text } from '@/src/components/ui';
import { colors, spacing } from '@/src/design-system/tokens';
import {
  AccessibilityInfo,
  EnrichmentSavePayload,
  EnrichmentSourceType,
  FamilyFacilitiesMap,
  SendInfo,
  TriState,
} from '@/src/types/enrichment';
import { VenueEnrichmentDraftRecord } from '@/src/types/ai-enrichment';
import { VenueFamilyMetadata } from '@/src/types/places';
import { enrichmentApi } from '@/src/services/enrichment/enrichment-api-client';
import { draftJsonToReviewForm, formatDraftConfidence } from '@/src/utils/ai-draft-review';
import { getAiDraftInternalLabel } from '@/src/utils/family-match-classification';
import { validateVerifiedRequirements } from '@/src/utils/enrichment-rules';

const SOURCE_TYPES: EnrichmentSourceType[] = [
  'official_website',
  'venue_contact',
  'google_provider',
  'family_pilot_editorial',
  'ai_assisted',
  'community_report',
  'local_authority',
  'other',
];

function metadataToForm(meta: VenueFamilyMetadata | null): EnrichmentSavePayload {
  if (!meta) {
    return {
      familyFacilities: {},
      goodToKnow: [],
      whyFamiliesLike: [],
      lastChecked: new Date().toISOString().slice(0, 10),
      enrichmentProvenance: {
        sourceType: 'family_pilot_editorial',
        checkedDate: new Date().toISOString().slice(0, 10),
      },
    };
  }
  return {
    minRecommendedAge: meta.minRecommendedAge,
    maxRecommendedAge: meta.maxRecommendedAge,
    ageNotes: meta.ageNotes,
    bestAges: meta.bestAges,
    familyFacilities: meta.familyFacilities ?? {},
    pushchairSuitability: meta.pushchairSuitability,
    pathSurface: meta.pathSurface,
    extendedTerrain: meta.extendedTerrain,
    terrain: meta.terrain,
    terrainNotes: meta.terrainNotes,
    accessibility: meta.accessibility ?? {},
    sendInfo: meta.sendInfo ?? {},
    whyFamiliesLike: meta.whyFamiliesLike ?? [],
    goodToKnow: meta.goodToKnow ?? [],
    warnings: meta.warnings ?? [],
    familyNotes: meta.familyNotes,
    parkingInfo: meta.parkingInfo,
    estimatedSpend: meta.estimatedSpend,
    visitDurationMinutes: meta.visitDurationMinutes,
    categoryConfirmed: meta.categoryConfirmed,
    enrichmentProvenance: meta.enrichmentProvenance ?? {
      sourceType: 'family_pilot_editorial',
      checkedDate: new Date().toISOString().slice(0, 10),
    },
    lastChecked: meta.lastChecked ?? new Date().toISOString().slice(0, 10),
    checkedBy: meta.checkedBy,
    betaPriority: meta.betaPriority,
  };
}

export default function EnrichmentFormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [venueName, setVenueName] = useState('');
  const [enrichmentStatus, setEnrichmentStatus] = useState<string>('provider_only');
  const [draft, setDraft] = useState<VenueEnrichmentDraftRecord | null>(null);
  const [generating, setGenerating] = useState(false);
  const [form, setForm] = useState<EnrichmentSavePayload>(metadataToForm(null));
  const [error, setError] = useState('');
  const [verificationHint, setVerificationHint] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { place, metadata, draft: pendingDraft } = await enrichmentApi.getVenue(id);
      setVenueName((place?.name as string) ?? id);
      setEnrichmentStatus(metadata?.enrichmentStatus ?? 'provider_only');
      setDraft(pendingDraft ?? null);
      if (pendingDraft?.draftJson && (metadata?.enrichmentStatus === 'ai_draft' || !metadata)) {
        setForm(draftJsonToReviewForm(pendingDraft.draftJson));
      } else {
        setForm(metadataToForm(metadata));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const v = validateVerifiedRequirements(form);
    setVerificationHint(v.ok ? 'Ready for verified' : `Verified requires: ${v.missing.join(', ')}`);
  }, [form]);

  const patch = (updates: Partial<EnrichmentSavePayload>) => {
    setDirty(true);
    setForm((prev) => ({ ...prev, ...updates }));
  };

  const patchFacility = (key: keyof FamilyFacilitiesMap, value: TriState) => {
    patch({ familyFacilities: { ...form.familyFacilities, [key]: value } });
  };

  const patchAccessibility = (key: keyof AccessibilityInfo, value: TriState) => {
    patch({ accessibility: { ...form.accessibility, [key]: value } });
  };

  const patchSend = (key: keyof SendInfo, value: TriState) => {
    patch({ sendInfo: { ...form.sendInfo, [key]: value } });
  };

  const save = async (requestedStatus: 'enriched' | 'verified', goNext = false) => {
    if (!id) return;
    setSaving(true);
    setError('');
    try {
      await enrichmentApi.saveVenue(id, { ...form, requestedStatus });
      setDirty(false);
      if (goNext) {
        router.back();
      } else {
        Alert.alert('Saved', `Venue marked as ${requestedStatus}`);
        await load();
      }
    } catch (e) {
      const err = e as Error & { missing?: string[] };
      setError(err.missing?.length ? `${err.message}` : err.message);
    } finally {
      setSaving(false);
    }
  };

  const generateDraft = async () => {
    if (!id) return;
    setGenerating(true);
    setError('');
    try {
      const result = await enrichmentApi.generateDraft(id);
      setDraft(result.draft);
      setForm(draftJsonToReviewForm(result.draft.draftJson));
      setEnrichmentStatus('ai_draft');
      setDirty(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Draft generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const approveDraftAction = async () => {
    if (!id) return;
    setSaving(true);
    setError('');
    try {
      await enrichmentApi.approveDraft(id, form);
      setDirty(false);
      Alert.alert('Approved', 'Draft approved — venue is now enriched');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approve failed');
    } finally {
      setSaving(false);
    }
  };

  const rejectDraftAction = async () => {
    if (!id) return;
    setSaving(true);
    setError('');
    try {
      await enrichmentApi.rejectDraft(id);
      setDraft(null);
      setEnrichmentStatus('provider_only');
      setForm(metadataToForm(null));
      setDirty(false);
      Alert.alert('Rejected', 'AI draft discarded — venue returned to provider only');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reject failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary[500]} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text variant="heading2">{venueName}</Text>
      <Text variant="caption" color={colors.text.secondary}>{id}</Text>
      <Text variant="caption" color={colors.text.secondary}>
        Status: {enrichmentStatus === 'ai_draft' ? getAiDraftInternalLabel() : enrichmentStatus.replace('_', ' ')}
      </Text>
      {draft ? (
        <View style={styles.draftBox}>
          <Text variant="heading3">AI suggested — review required</Text>
          <Text variant="caption" color={colors.text.secondary}>
            Model: {draft.model} · Overall confidence: {formatDraftConfidence(draft.draftJson.overallDraftConfidence)}
          </Text>
          <DraftField
            label="Toilets"
            value={draft.draftJson.familyFacilities.toilets.value}
            confidence={draft.draftJson.familyFacilities.toilets.confidence}
            reason={draft.draftJson.familyFacilities.toilets.reason}
          />
          <DraftField
            label="Baby changing"
            value={draft.draftJson.familyFacilities.babyChanging.value}
            confidence={draft.draftJson.familyFacilities.babyChanging.confidence}
            reason={draft.draftJson.familyFacilities.babyChanging.reason}
          />
          <DraftField
            label="Pushchair suitability"
            value={draft.draftJson.pushchairSuitability.value}
            confidence={draft.draftJson.pushchairSuitability.confidence}
            reason={draft.draftJson.pushchairSuitability.reason}
          />
          {(draft.draftJson.whyFamiliesLike ?? []).length > 0 ? (
            <Text variant="caption">Why families may like: {draft.draftJson.whyFamiliesLike.join(' · ')}</Text>
          ) : null}
          <View style={styles.row}>
            <Pressable style={styles.primaryBtn} disabled={saving} onPress={() => void approveDraftAction()}>
              <Text variant="body" color={colors.text.inverse}>Approve draft</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} disabled={saving} onPress={() => void rejectDraftAction()}>
              <Text variant="body">Reject draft</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {!draft && enrichmentStatus !== 'enriched' && enrichmentStatus !== 'verified' ? (
        <Pressable style={styles.secondaryBtn} disabled={generating} onPress={() => void generateDraft()}>
          <Text variant="body">{generating ? 'Generating AI draft…' : 'Generate AI draft'}</Text>
        </Pressable>
      ) : null}
      {dirty ? <Text variant="caption" color={colors.warning[600]}>Unsaved changes</Text> : null}
      {error ? <Text variant="caption" color={colors.error[600]}>{error}</Text> : null}

      <Section title="Core suitability">
        <Field label="Min age" value={String(form.minRecommendedAge ?? '')} onChange={(v) => patch({ minRecommendedAge: v ? Number(v) : null })} keyboardType="number-pad" />
        <Field label="Max age" value={String(form.maxRecommendedAge ?? '')} onChange={(v) => patch({ maxRecommendedAge: v ? Number(v) : null })} keyboardType="number-pad" />
        <Field label="Age notes" value={form.ageNotes ?? ''} onChange={(v) => patch({ ageNotes: v })} multiline />
        <TriStateToggle label="Category confirmed" value={form.categoryConfirmed} onChange={(v) => patch({ categoryConfirmed: v })} />
      </Section>

      <Section title="Family facilities">
        <TriStateToggle label="Toilets" value={form.familyFacilities?.toilets} onChange={(v) => patchFacility('toilets', v)} />
        <TriStateToggle label="Baby changing" value={form.familyFacilities?.babyChanging} onChange={(v) => patchFacility('babyChanging', v)} />
        <TriStateToggle label="Parking" value={form.familyFacilities?.parking} onChange={(v) => patchFacility('parking', v)} />
        <TriStateToggle label="Free parking" value={form.familyFacilities?.freeParking} onChange={(v) => patchFacility('freeParking', v)} />
        <TriStateToggle label="Café" value={form.familyFacilities?.cafe} onChange={(v) => patchFacility('cafe', v)} />
        <TriStateToggle label="Playground" value={form.familyFacilities?.playground} onChange={(v) => patchFacility('playground', v)} />
        <TriStateToggle label="Fenced playground" value={form.familyFacilities?.fencedPlayground} onChange={(v) => patchFacility('fencedPlayground', v)} />
        <TriStateToggle label="Picnic area" value={form.familyFacilities?.picnicArea} onChange={(v) => patchFacility('picnicArea', v)} />
        <TriStateToggle label="Shade" value={form.familyFacilities?.shade} onChange={(v) => patchFacility('shade', v)} />
      </Section>

      <Section title="Pushchair & terrain">
        <Field label="Pushchair suitability" value={form.pushchairSuitability ?? ''} onChange={(v) => patch({ pushchairSuitability: v as EnrichmentSavePayload['pushchairSuitability'] })} placeholder="excellent/good/mixed/difficult/unknown" />
        <Field label="Terrain" value={form.extendedTerrain ?? ''} onChange={(v) => patch({ extendedTerrain: v as EnrichmentSavePayload['extendedTerrain'] })} placeholder="flat/mostly_flat/mixed/hilly/very_hilly/unknown" />
        <Field label="Path surface" value={form.pathSurface ?? ''} onChange={(v) => patch({ pathSurface: v as EnrichmentSavePayload['pathSurface'] })} placeholder="paved/gravel/grass/mixed/unknown" />
        <Field label="Terrain notes" value={form.terrainNotes ?? ''} onChange={(v) => patch({ terrainNotes: v })} multiline />
        <Field label="Parking info" value={form.parkingInfo ?? ''} onChange={(v) => patch({ parkingInfo: v })} multiline />
      </Section>

      <Section title="Accessibility (factual)">
        <TriStateToggle label="Step-free entrance" value={form.accessibility?.stepFreeEntrance} onChange={(v) => patchAccessibility('stepFreeEntrance', v)} />
        <TriStateToggle label="Wheelchair accessible" value={form.accessibility?.wheelchairAccessible} onChange={(v) => patchAccessibility('wheelchairAccessible', v)} />
        <TriStateToggle label="Accessible toilet" value={form.accessibility?.accessibleToilet} onChange={(v) => patchAccessibility('accessibleToilet', v)} />
        <TriStateToggle label="Changing Places" value={form.accessibility?.changingPlaces} onChange={(v) => patchAccessibility('changingPlaces', v)} />
        <TriStateToggle label="Accessible parking" value={form.accessibility?.accessibleParking} onChange={(v) => patchAccessibility('accessibleParking', v)} />
        <Field label="Accessibility notes" value={form.accessibility?.notes ?? ''} onChange={(v) => patch({ accessibility: { ...form.accessibility, notes: v } })} multiline />
      </Section>

      <Section title="SEND (factual)">
        <TriStateToggle label="Quiet sessions" value={form.sendInfo?.quietSessions} onChange={(v) => patchSend('quietSessions', v)} />
        <TriStateToggle label="Sensory-friendly sessions" value={form.sendInfo?.sensoryFriendlySessions} onChange={(v) => patchSend('sensoryFriendlySessions', v)} />
        <TriStateToggle label="Ear defenders available" value={form.sendInfo?.earDefendersAvailable} onChange={(v) => patchSend('earDefendersAvailable', v)} />
        <TriStateToggle label="Queue assistance" value={form.sendInfo?.queueAssistance} onChange={(v) => patchSend('queueAssistance', v)} />
        <Field label="Schedule / details notes" value={form.sendInfo?.scheduleNotes ?? ''} onChange={(v) => patch({ sendInfo: { ...form.sendInfo, scheduleNotes: v } })} multiline />
      </Section>

      <Section title="Family notes">
        <Field label="Why families may like it (one per line)" value={(form.whyFamiliesLike ?? []).join('\n')} onChange={(v) => patch({ whyFamiliesLike: v.split('\n').filter(Boolean) })} multiline />
        <Field label="Good to know (one per line)" value={(form.goodToKnow ?? []).join('\n')} onChange={(v) => patch({ goodToKnow: v.split('\n').filter(Boolean) })} multiline />
        <Field label="Family notes" value={form.familyNotes ?? ''} onChange={(v) => patch({ familyNotes: v })} multiline />
      </Section>

      <Section title="Provenance">
        <Text variant="caption" color={colors.text.secondary}>Source type</Text>
        <View style={styles.sourceRow}>
          {SOURCE_TYPES.map((s) => (
            <Pressable
              key={s}
              style={[styles.chip, form.enrichmentProvenance?.sourceType === s && styles.chipActive]}
              onPress={() => patch({
                enrichmentProvenance: {
                  ...form.enrichmentProvenance,
                  sourceType: s,
                  checkedDate: form.enrichmentProvenance?.checkedDate ?? new Date().toISOString().slice(0, 10),
                },
              })}
            >
              <Text variant="caption">{s.replace(/_/g, ' ')}</Text>
            </Pressable>
          ))}
        </View>
        <Field label="Source reference" value={form.enrichmentProvenance?.sourceReference ?? ''} onChange={(v) => patch({ enrichmentProvenance: { ...form.enrichmentProvenance!, sourceReference: v } })} />
        <Field label="Last checked (YYYY-MM-DD)" value={form.lastChecked ?? ''} onChange={(v) => patch({ lastChecked: v })} />
        <Field label="Checked by" value={form.checkedBy ?? ''} onChange={(v) => patch({ checkedBy: v })} />
        <Field label="Evidence notes" value={form.enrichmentProvenance?.evidenceNotes ?? ''} onChange={(v) => patch({ enrichmentProvenance: { ...form.enrichmentProvenance!, evidenceNotes: v } })} multiline />
        <Text variant="caption" color={colors.text.tertiary}>{verificationHint}</Text>
      </Section>

      <View style={styles.actions}>
        <Pressable style={styles.primaryBtn} disabled={saving} onPress={() => void save('enriched')}>
          <Text variant="body" color={colors.text.inverse}>{saving ? 'Saving…' : 'Save as enriched'}</Text>
        </Pressable>
        <Pressable style={styles.primaryBtn} disabled={saving} onPress={() => void save('verified')}>
          <Text variant="body" color={colors.text.inverse}>Save as verified</Text>
        </Pressable>
        <Pressable style={styles.secondaryBtn} disabled={saving} onPress={() => void save('enriched', true)}>
          <Text variant="body">Save & back</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function DraftField({
  label,
  value,
  confidence,
  reason,
}: {
  label: string;
  value: string;
  confidence: string;
  reason?: string | null;
}) {
  return (
    <View style={styles.draftField}>
      <Text variant="caption">{label}: {value} · Confidence: {formatDraftConfidence(confidence)}</Text>
      {reason ? <Text variant="caption" color={colors.text.tertiary}>{reason}</Text> : null}
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="heading3">{title}</Text>
      {children}
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline,
  keyboardType,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  keyboardType?: 'number-pad' | 'default';
  placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <Text variant="caption">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        keyboardType={keyboardType}
        placeholder={placeholder}
        style={[styles.input, multiline && styles.multiline]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding, gap: spacing.md, paddingBottom: 120 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  section: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.sm,
  },
  field: { gap: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.sm,
    backgroundColor: colors.background,
    fontSize: 15,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  sourceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipActive: { borderColor: colors.primary[500], backgroundColor: colors.primary[50] },
  draftBox: {
    backgroundColor: colors.warning[50] ?? colors.surface,
    padding: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.warning[100] ?? colors.border,
    gap: spacing.sm,
  },
  draftField: { gap: 2 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actions: { gap: spacing.sm },
  primaryBtn: {
    backgroundColor: colors.primary[500],
    padding: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryBtn: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
});
