const fs = require('fs');
const path = require('path');

const { getSupabaseAdmin, isSupabaseConfigured } = require('./supabase-admin');
const {
  buildBestAges,
  facilitiesFromTriState,
  mapExtendedTerrain,
  resolveEnrichmentStatus,
} = require('./validation');

const FILE_STORE_PATH = path.join(process.cwd(), '.data', 'enrichment-store.json');

function ensureFileStore() {
  const dir = path.dirname(FILE_STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(FILE_STORE_PATH)) {
    fs.writeFileSync(FILE_STORE_PATH, JSON.stringify({ places: {}, metadata: {} }, null, 2));
  }
}

function readFileStore() {
  ensureFileStore();
  return JSON.parse(fs.readFileSync(FILE_STORE_PATH, 'utf8'));
}

function writeFileStore(data) {
  ensureFileStore();
  fs.writeFileSync(FILE_STORE_PATH, JSON.stringify(data, null, 2));
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
    fetched_at: place.fetchedAt || new Date().toISOString(),
    field_provenance: {
      googlePrimaryType: place.googlePrimaryType,
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

async function saveMetadata(familypilotId, payload) {
  const existing = await getMetadata(familypilotId);
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

  const items = places.map((row) => {
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
      enrichmentStatus,
      lastChecked: meta?.lastChecked,
      sourceType: meta?.enrichmentProvenance?.sourceType,
      hasMetadata: Boolean(meta),
      betaPriority: meta?.betaPriority || false,
      fetchedAt: place.fetchedAt,
    };
  });

  let filtered = items;
  if (filters.status) {
    filtered = filtered.filter((item) => item.enrichmentStatus === filters.status);
  }

  if (filters.betaLat != null && filters.betaLng != null && filters.betaRadiusKm != null) {
    filtered = filtered.filter((item) => {
      const km = haversineKm(filters.betaLat, filters.betaLng, item.latitude, item.longitude);
      return km <= filters.betaRadiusKm;
    });
  }

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

  return filtered;
}

async function getStats() {
  const items = await listQueue({});
  const byCategory = {};
  for (const item of items) {
    byCategory[item.category] = (byCategory[item.category] || 0) + 1;
  }

  const enriched = items.filter((i) => i.enrichmentStatus === 'enriched').length;
  const verified = items.filter((i) => i.enrichmentStatus === 'verified').length;
  const providerOnly = items.filter((i) => i.enrichmentStatus === 'provider_only').length;

  return {
    discovered: items.length,
    providerOnly,
    enriched,
    verified,
    awaitingReview: providerOnly,
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
  getMetadata,
  saveMetadata,
  listQueue,
  getStats,
  getStorageMode,
  isSupabaseConfigured,
};
