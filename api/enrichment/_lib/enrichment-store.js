const fs = require('fs');
const path = require('path');

const { getSupabaseAdmin, isSupabaseConfigured } = require('./supabase-admin');
const { mapGoogleCategory } = require('../../places/lib/places-quality');
const {
  buildBestAges,
  facilitiesFromTriState,
  mapExtendedTerrain,
  resolveEnrichmentStatus,
} = require('./validation');
const {
  rebuildMetadataPayloadFromClaims,
  syncClaimsFromEditorSave,
  venueHasActiveClaims,
} = require('./claims-store');
const { loadCanonicalStore, getCanonicalVenueForPlace } = require('../../places/lib/canonical-venues');

const FILE_STORE_DIR = '.data';
const FILE_STORE_NAME = 'enrichment-store.json';

function getFileStorePath() {
  return path.join(process.cwd(), FILE_STORE_DIR, FILE_STORE_NAME);
}

function ensureFileStore() {
  const filePath = getFileStorePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({ places: {}, metadata: {} }, null, 2));
  }
}

function readFileStore() {
  ensureFileStore();
  return JSON.parse(fs.readFileSync(getFileStorePath(), 'utf8'));
}

function writeFileStore(data) {
  ensureFileStore();
  fs.writeFileSync(getFileStorePath(), JSON.stringify(data, null, 2));
}

function rowToMetadata(row) {
  if (!row) return null;
  return {
    familypilotPlaceId: row.familypilot_place_id,
    enrichmentStatus: row.enrichment_status || 'provider_only',
    bestAges: row.best_ages,
    minRecommendedAge: row.min_recommended_age,
    maxRecommendedAge: row.max_recommended_age,
    ageNotes: row.age_notes,
    terrain: row.terrain,
    extendedTerrain: row.extended_terrain,
    terrainNotes: row.terrain_notes,
    pathSurface: row.path_surface,
    facilities: row.facilities || [],
    familyFacilities: row.family_facilities || {},
    parkingInfo: row.parking_info,
    visitDurationMinutes: row.visit_duration_minutes,
    warnings: row.warnings || [],
    goodToKnow: row.good_to_know || [],
    whyFamiliesLike: row.why_families_like || [],
    estimatedSpend: row.estimated_spend,
    pushchairSuitability: row.pushchair_suitability,
    environment: row.environment ?? undefined,
    energyLevel: row.energy_level ?? undefined,
    accessibility: row.accessibility || {},
    sendInfo: row.send_info || {},
    familyNotes: row.family_notes,
    categoryConfirmed: row.category_confirmed,
    enrichmentProvenance: row.enrichment_provenance || {},
    lastChecked: row.last_checked,
    checkedBy: row.checked_by,
    betaPriority: row.beta_priority || false,
    provenance: row.field_provenance || {},
    updatedAt: row.updated_at,
  };
}

function metadataToRow(id, payload, status) {
  const bestAges = buildBestAges(payload);
  const terrain = payload.terrain || mapExtendedTerrain(payload.extendedTerrain);
  const facilities = facilitiesFromTriState(payload.familyFacilities);

  return {
    familypilot_place_id: id,
    enrichment_status: status,
    best_ages: bestAges,
    min_recommended_age: payload.minRecommendedAge ?? null,
    max_recommended_age: payload.maxRecommendedAge ?? null,
    age_notes: payload.ageNotes ?? null,
    terrain,
    extended_terrain: payload.extendedTerrain ?? null,
    terrain_notes: payload.terrainNotes ?? null,
    path_surface: payload.pathSurface ?? null,
    facilities,
    family_facilities: payload.familyFacilities ?? {},
    parking_info: payload.parkingInfo ?? null,
    visit_duration_minutes: payload.visitDurationMinutes ?? null,
    warnings: payload.warnings ?? [],
    good_to_know: payload.goodToKnow ?? [],
    why_families_like: payload.whyFamiliesLike ?? [],
    estimated_spend: payload.estimatedSpend ?? null,
    pushchair_suitability: payload.pushchairSuitability ?? null,
    environment: payload.environment ?? null,
    energy_level: payload.energyLevel ?? null,
    accessibility: payload.accessibility ?? {},
    send_info: payload.sendInfo ?? {},
    family_notes: payload.familyNotes ?? null,
    category_confirmed: payload.categoryConfirmed ?? null,
    enrichment_provenance: payload.enrichmentProvenance ?? {},
    last_checked: payload.lastChecked ?? null,
    checked_by: payload.checkedBy ?? null,
    beta_priority: payload.betaPriority ?? false,
    field_provenance: {
      bestAges: payload.enrichmentProvenance
        ? {
            source: 'familypilot',
            updatedAt: payload.enrichmentProvenance.checkedDate,
            reliability: status === 'verified' ? 'familypilot' : 'estimated',
            label: payload.enrichmentProvenance.sourceType,
          }
        : undefined,
    },
    updated_at: new Date().toISOString(),
    updated_by: payload.checkedBy || 'enrichment-admin',
  };
}

function placeRowToRecord(row) {
  return {
    familypilotId: row.familypilot_place_id,
    externalId: row.external_id,
    provider: row.provider,
    name: row.name,
    category: row.category,
    latitude: row.lat,
    longitude: row.lng,
    address: row.address,
    googlePrimaryType: row.field_provenance?.googlePrimaryType,
    fetchedAt: row.fetched_at,
  };
}

async function upsertPlaceRecord(place) {
  const supabase = getSupabaseAdmin();
  const record = {
    familypilot_place_id: place.familypilotId,
    external_id: place.externalId,
    provider: place.provider,
    name: place.name,
    category: place.category,
    lat: place.latitude,
    lng: place.longitude,
    address: place.address ?? null,
    description: place.description ?? null,
    website: place.website ?? null,
    phone: place.phone ?? null,
    opening_hours: place.openingHours ?? null,
    is_open: place.isOpen ?? null,
    fetched_at: place.fetchedAt || new Date().toISOString(),
    field_provenance: {
      googlePrimaryType: place.googlePrimaryType,
      googleTypes: place.googleTypes || [],
    },
  };

  if (supabase) {
    const { error } = await supabase.from('place_records').upsert(record, {
      onConflict: 'familypilot_place_id',
    });
    if (error) {
      if (error.message.includes('row-level security')) {
        throw new Error(
          'Supabase rejected the place_records write (RLS). The server is not using a service_role JWT — check Vercel SUPABASE_SERVICE_ROLE_KEY is the service_role secret, not the anon/public key.',
        );
      }
      throw new Error(error.message);
    }
    return;
  }

  const store = readFileStore();
  store.places[place.familypilotId] = record;
  writeFileStore(store);
}

async function upsertPlaceRecords(places) {
  for (const place of places) {
    await upsertPlaceRecord(place);
  }
}

/**
 * Re-map provider_only place_records using stored Google types + current rules.
 * Skips rows with enriched or verified metadata. Does not delete rows.
 */
async function reclassifyProviderOnlyPlaceRecords() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { updated: 0, skippedProtected: 0 };

  const { data: placeRows, error } = await supabase.from('place_records').select('*');
  if (error) throw new Error(error.message);

  const { data: metaRows } = await supabase
    .from('venue_family_metadata')
    .select('familypilot_place_id, enrichment_status');

  const protectedIds = new Set(
    (metaRows || [])
      .filter(
        (row) =>
          row.enrichment_status === 'enriched' || row.enrichment_status === 'verified',
      )
      .map((row) => row.familypilot_place_id),
  );

  let updated = 0;
  let skippedProtected = 0;

  for (const row of placeRows || []) {
    if (protectedIds.has(row.familypilot_place_id)) {
      skippedProtected++;
      continue;
    }

    const primaryType = row.field_provenance?.googlePrimaryType;
    const types = row.field_provenance?.googleTypes || [];
    const newCategory = mapGoogleCategory(primaryType, types, row.name);
    if (!newCategory || newCategory === row.category) continue;

    const { error: updateError } = await supabase
      .from('place_records')
      .update({
        category: newCategory,
        field_provenance: {
          ...(row.field_provenance || {}),
          googlePrimaryType: primaryType,
          googleTypes: types,
          reclassifiedAt: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('familypilot_place_id', row.familypilot_place_id);

    if (!updateError) updated++;
  }

  return { updated, skippedProtected };
}

async function getMetadata(familypilotId) {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from('venue_family_metadata')
      .select('*')
      .eq('familypilot_place_id', familypilotId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return rowToMetadata(data);
  }

  const store = readFileStore();
  return rowToMetadata(store.metadata[familypilotId]);
}

async function saveMetadata(familypilotId, payload, options = {}) {
  const existing = await getMetadata(familypilotId);
  const reviewedBy = payload.checkedBy || 'enrichment-admin';

  if (options.fromClaims) {
    const projected = await rebuildMetadataPayloadFromClaims(familypilotId, payload);
    if (projected) payload = projected;
  } else if (options.syncClaims) {
    await syncClaimsFromEditorSave(familypilotId, payload, reviewedBy);
    const projected = await rebuildMetadataPayloadFromClaims(familypilotId, payload);
    if (projected) payload = projected;
  } else if (await venueHasActiveClaims(familypilotId)) {
    const projected = await rebuildMetadataPayloadFromClaims(familypilotId, payload);
    if (projected) payload = projected;
  }

  const status = resolveEnrichmentStatus(payload, existing);
  const row = metadataToRow(familypilotId, payload, status);

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from('venue_family_metadata')
      .upsert(row, { onConflict: 'familypilot_place_id' })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return rowToMetadata(data);
  }

  const store = readFileStore();
  store.metadata[familypilotId] = row;
  writeFileStore(store);
  return rowToMetadata(row);
}

const REVIEW_PIPELINE_STATUSES = new Set(['ai_draft', 'enriched', 'verified']);

function isWithinBetaArea(item, betaLat, betaLng, betaRadiusKm) {
  if (!Number.isFinite(item.latitude) || !Number.isFinite(item.longitude)) {
    return false;
  }
  const km = haversineKm(betaLat, betaLng, item.latitude, item.longitude);
  return Number.isFinite(km) && km <= betaRadiusKm;
}

function applyBetaAreaFilter(items, filters) {
  if (filters.betaLat == null || filters.betaLng == null || filters.betaRadiusKm == null) {
    return items;
  }

  return items.filter((item) => {
    // Review-pipeline venues stay visible regardless of beta area — only discovery
    // candidates (provider_only) are scoped to the sync box.
    if (REVIEW_PIPELINE_STATUSES.has(item.enrichmentStatus)) {
      return true;
    }
    return isWithinBetaArea(item, filters.betaLat, filters.betaLng, filters.betaRadiusKm);
  });
}

async function listQueue(filters = {}) {
  const supabase = getSupabaseAdmin();
  let places = [];
  let metadataMap = {};

  if (supabase) {
    let query = supabase.from('place_records').select('*').order('fetched_at', { ascending: false });
    if (filters.provider) query = query.eq('provider', filters.provider);
    const { data: placeRows, error } = await query;
    if (error) throw new Error(error.message);
    places = placeRows || [];

    const { data: metaRows } = await supabase.from('venue_family_metadata').select('*');
    for (const row of metaRows || []) {
      metadataMap[row.familypilot_place_id] = rowToMetadata(row);
    }
  } else {
    const store = readFileStore();
    places = Object.values(store.places);
    metadataMap = Object.fromEntries(
      Object.entries(store.metadata).map(([id, row]) => [id, rowToMetadata(row)]),
    );
  }

  const items = places
    .map((row) => {
      const place = placeRowToRecord(row);
      const meta = metadataMap[place.familypilotId] || null;
      const enrichmentStatus = meta?.enrichmentStatus || 'provider_only';
      return {
        familypilotId: place.familypilotId,
        externalId: place.externalId,
        provider: place.provider,
        name: place.name,
        category: place.category,
        latitude: place.latitude,
        longitude: place.longitude,
        address: place.address,
        googlePrimaryType: place.googlePrimaryType,
        googleTypes: row.field_provenance?.googleTypes || [],
        enrichmentStatus,
        lastChecked: meta?.lastChecked,
        sourceType: meta?.enrichmentProvenance?.sourceType,
        hasMetadata: Boolean(meta),
        betaPriority: meta?.betaPriority || false,
        fetchedAt: place.fetchedAt,
      };
    })
    .filter((item) => {
      if (item.enrichmentStatus === 'enriched' || item.enrichmentStatus === 'verified') {
        return true;
      }
      if (item.enrichmentStatus === 'ai_draft') return true;
      return mapGoogleCategory(item.googlePrimaryType, item.googleTypes, item.name) !== null;
    });

  let filtered = items;
  if (filters.status) {
    filtered = filtered.filter((item) => item.enrichmentStatus === filters.status);
  }

  filtered = applyBetaAreaFilter(filtered, filters);

  const sort = filters.sort || 'newest';
  filtered.sort((a, b) => {
    if (sort === 'alphabetical') return a.name.localeCompare(b.name);
    if (sort === 'priority') return Number(b.betaPriority) - Number(a.betaPriority);
    if (sort === 'nearest' && filters.betaLat != null) {
      return (
        haversineKm(filters.betaLat, filters.betaLng, a.latitude, a.longitude) -
        haversineKm(filters.betaLat, filters.betaLng, b.latitude, b.longitude)
      );
    }
    return new Date(b.fetchedAt || 0).getTime() - new Date(a.fetchedAt || 0).getTime();
  });

  return enrichQueueItemsWithCanonical(filtered);
}

async function enrichQueueItemsWithCanonical(items) {
  try {
    const store = await loadCanonicalStore();
    return items.map((item) => {
      const match = getCanonicalVenueForPlace(store, item.familypilotId);
      if (!match) return item;
      return {
        ...item,
        canonicalVenueId: match.canonicalVenue.id,
        canonicalPrimaryPlaceId: match.canonicalVenue.primaryFamilypilotPlaceId,
        canonicalLinkType: match.link.linkType,
        canonicalReviewStatus: match.canonicalVenue.reviewStatus,
        isCanonicalAlias: match.link.linkType === 'alias',
      };
    });
  } catch {
    return items;
  }
}

async function getStats(filters = {}) {
  const items = await listQueue({
    provider: filters.provider ?? 'google',
    betaLat: filters.betaLat,
    betaLng: filters.betaLng,
    betaRadiusKm: filters.betaRadiusKm,
  });
  const byCategory = {};
  for (const item of items) {
    byCategory[item.category] = (byCategory[item.category] || 0) + 1;
  }

  const enriched = items.filter((i) => i.enrichmentStatus === 'enriched').length;
  const verified = items.filter((i) => i.enrichmentStatus === 'verified').length;
  const aiDraft = items.filter((i) => i.enrichmentStatus === 'ai_draft').length;
  const providerOnly = items.filter((i) => i.enrichmentStatus === 'provider_only').length;

  return {
    discovered: items.length,
    providerOnly,
    aiDraft,
    enriched,
    verified,
    awaitingReview: providerOnly + aiDraft,
    byCategory,
  };
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getStorageMode() {
  if (isSupabaseConfigured()) return 'supabase';
  return 'file';
}

module.exports = {
  upsertPlaceRecord,
  upsertPlaceRecords,
  reclassifyProviderOnlyPlaceRecords,
  getMetadata,
  saveMetadata,
  listQueue,
  getStats,
  getStorageMode,
  isSupabaseConfigured,
  applyBetaAreaFilter,
  REVIEW_PIPELINE_STATUSES,
};
