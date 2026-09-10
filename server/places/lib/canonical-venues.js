/**
 * Canonical venue identity store.
 * Links duplicate place_records without deleting source rows, drafts, or claims.
 */

const fs = require('fs');
const path = require('path');

const { getSupabaseAdmin, isSupabaseConfigured } = require('../../enrichment/_lib/supabase-admin');

const FILE_STORE_DIR = '.data';
const FILE_STORE_NAME = 'canonical-venues.json';

let memoryCache = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 60_000;

function getFileStorePath() {
  return path.join(process.cwd(), FILE_STORE_DIR, FILE_STORE_NAME);
}

function emptyStore() {
  return {
    canonicalVenues: {},
    links: {},
  };
}

function readFileStore() {
  const filePath = getFileStorePath();
  if (!fs.existsSync(filePath)) return emptyStore();
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeFileStore(data) {
  const filePath = getFileStorePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function rowToCanonicalVenue(row) {
  return {
    id: row.id,
    displayName: row.display_name,
    primaryFamilypilotPlaceId: row.primary_familypilot_place_id,
    reviewStatus: row.review_status,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToLink(row) {
  return {
    id: row.id,
    canonicalVenueId: row.canonical_venue_id,
    familypilotPlaceId: row.familypilot_place_id,
    linkType: row.link_type,
    provider: row.provider ?? null,
    externalId: row.external_id ?? null,
    matchMethod: row.match_method ?? null,
    matchConfidence: row.match_confidence != null ? Number(row.match_confidence) : null,
    reviewedAt: row.reviewed_at ?? null,
    reviewedBy: row.reviewed_by ?? null,
    createdAt: row.created_at,
  };
}

async function loadFromSupabase() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const [{ data: canonicalRows, error: canonicalError }, { data: linkRows, error: linkError }] =
    await Promise.all([
      supabase.from('canonical_venues').select('*'),
      supabase.from('venue_place_links').select('*'),
    ]);

  if (canonicalError) throw canonicalError;
  if (linkError) throw linkError;

  const canonicalVenues = {};
  for (const row of canonicalRows ?? []) {
    canonicalVenues[row.id] = rowToCanonicalVenue(row);
  }

  const links = {};
  for (const row of linkRows ?? []) {
    links[row.familypilot_place_id] = rowToLink(row);
  }

  return { canonicalVenues, links };
}

async function loadCanonicalStore(force = false) {
  const now = Date.now();
  if (!force && memoryCache && now - cacheLoadedAt < CACHE_TTL_MS) {
    return memoryCache;
  }

  if (isSupabaseConfigured()) {
    memoryCache = await loadFromSupabase();
  } else {
    memoryCache = readFileStore();
  }

  cacheLoadedAt = now;
  return memoryCache;
}

function invalidateCanonicalCache() {
  memoryCache = null;
  cacheLoadedAt = 0;
}

function getCanonicalVenueForPlace(store, familypilotPlaceId) {
  const link = store.links[familypilotPlaceId];
  if (!link) return null;
  const canonicalVenue = store.canonicalVenues[link.canonicalVenueId];
  if (!canonicalVenue) return null;
  return { canonicalVenue, link };
}

async function resolvePrimaryPlaceId(familypilotPlaceId) {
  const store = await loadCanonicalStore();
  const match = getCanonicalVenueForPlace(store, familypilotPlaceId);
  if (!match) return familypilotPlaceId;
  if (match.canonicalVenue.reviewStatus === 'rejected') return familypilotPlaceId;
  return match.canonicalVenue.primaryFamilypilotPlaceId;
}

async function getCanonicalIdentity(familypilotPlaceId) {
  const store = await loadCanonicalStore();
  const match = getCanonicalVenueForPlace(store, familypilotPlaceId);
  if (!match) {
    return {
      familypilotPlaceId,
      canonicalVenueId: null,
      primaryFamilypilotPlaceId: familypilotPlaceId,
      linkType: null,
      reviewStatus: null,
      isAlias: false,
    };
  }

  const aliases = Object.values(store.links)
    .filter((link) => link.canonicalVenueId === match.canonicalVenue.id)
    .map((link) => link.familypilotPlaceId);

  return {
    familypilotPlaceId,
    canonicalVenueId: match.canonicalVenue.id,
    primaryFamilypilotPlaceId: match.canonicalVenue.primaryFamilypilotPlaceId,
    displayName: match.canonicalVenue.displayName,
    linkType: match.link.linkType,
    reviewStatus: match.canonicalVenue.reviewStatus,
    isAlias: match.link.linkType === 'alias',
    aliasPlaceIds: aliases.filter((id) => id !== match.canonicalVenue.primaryFamilypilotPlaceId),
  };
}

async function shouldSuppressPlaceId(familypilotPlaceId) {
  const store = await loadCanonicalStore();
  const match = getCanonicalVenueForPlace(store, familypilotPlaceId);
  if (!match) return false;
  if (match.canonicalVenue.reviewStatus === 'rejected') return false;
  return match.link.linkType === 'alias';
}

async function filterPlacesToCanonicalPrimaries(places) {
  const store = await loadCanonicalStore();
  const filtered = [];

  for (const place of places) {
    const match = getCanonicalVenueForPlace(store, place.familypilotId);
    if (!match) {
      filtered.push({
        ...place,
        canonicalPlaceId: place.familypilotId,
        isCanonicalAlias: false,
      });
      continue;
    }

    if (match.canonicalVenue.reviewStatus === 'rejected') {
      filtered.push({
        ...place,
        canonicalPlaceId: place.familypilotId,
        isCanonicalAlias: false,
      });
      continue;
    }

    if (match.link.linkType === 'alias') {
      continue;
    }

    filtered.push({
      ...place,
      canonicalPlaceId: match.canonicalVenue.primaryFamilypilotPlaceId,
      canonicalVenueId: match.canonicalVenue.id,
      isCanonicalAlias: false,
    });
  }

  return filtered;
}

async function upsertHeuristicLink({
  primary,
  alias,
  matchMethod = 'heuristic:venue_alias',
  matchConfidence = 0.75,
  reviewStatus = 'uncertain',
}) {
  const supabase = getSupabaseAdmin();

  if (supabase) {
    const { data: existingCanonical } = await supabase
      .from('canonical_venues')
      .select('id, review_status')
      .eq('primary_familypilot_place_id', primary.familypilotId)
      .maybeSingle();

    let canonicalId = existingCanonical?.id ?? null;

    if (!canonicalId) {
      const { data: inserted, error: insertError } = await supabase
        .from('canonical_venues')
        .insert({
          display_name: primary.name,
          primary_familypilot_place_id: primary.familypilotId,
          review_status: reviewStatus,
          notes: 'Created from heuristic duplicate detection — review before confirming',
        })
        .select('*')
        .single();
      if (insertError) throw insertError;
      canonicalId = inserted.id;
    } else if (existingCanonical.review_status === 'confirmed') {
      reviewStatus = 'confirmed';
    }

    const linkRows = [
      {
        canonical_venue_id: canonicalId,
        familypilot_place_id: primary.familypilotId,
        link_type: 'primary',
        provider: primary.provider ?? null,
        external_id: primary.externalId ?? null,
        match_method: matchMethod,
        match_confidence: 1,
      },
      {
        canonical_venue_id: canonicalId,
        familypilot_place_id: alias.familypilotId,
        link_type: reviewStatus === 'confirmed' ? 'alias' : 'uncertain',
        provider: alias.provider ?? null,
        external_id: alias.externalId ?? null,
        match_method: matchMethod,
        match_confidence: matchConfidence,
      },
    ];

    for (const row of linkRows) {
      const { error } = await supabase.from('venue_place_links').upsert(row, {
        onConflict: 'familypilot_place_id',
      });
      if (error) throw error;
    }

    invalidateCanonicalCache();
    return { canonicalVenueId: canonicalId, reviewStatus };
  }

  const store = readFileStore();
  const canonicalVenueId = `local-${primary.familypilotId}`;
  store.canonicalVenues[canonicalVenueId] = {
    id: canonicalVenueId,
    displayName: primary.name,
    primaryFamilypilotPlaceId: primary.familypilotId,
    reviewStatus,
    notes: null,
  };
  store.links[primary.familypilotId] = {
    canonicalVenueId,
    familypilotPlaceId: primary.familypilotId,
    linkType: 'primary',
    matchMethod,
    matchConfidence: 1,
  };
  store.links[alias.familypilotId] = {
    canonicalVenueId,
    familypilotPlaceId: alias.familypilotId,
    linkType: reviewStatus === 'confirmed' ? 'alias' : 'uncertain',
    matchMethod,
    matchConfidence,
  };
  writeFileStore(store);
  invalidateCanonicalCache();
  return { canonicalVenueId, reviewStatus };
}

async function recordAliasPairs(pairs, { reviewStatus = 'uncertain' } = {}) {
  const results = [];
  for (const pair of pairs) {
    results.push(
      await upsertHeuristicLink({
        primary: pair.primary,
        alias: pair.alias,
        matchMethod: pair.matchMethod,
        matchConfidence: pair.matchConfidence,
        reviewStatus,
      }),
    );
  }
  return results;
}

async function listDuplicateGroups() {
  const store = await loadCanonicalStore();
  const groups = new Map();

  for (const link of Object.values(store.links)) {
    const canonicalVenue = store.canonicalVenues[link.canonicalVenueId];
    if (!canonicalVenue) continue;

    const group = groups.get(link.canonicalVenueId) ?? {
      canonicalVenueId: link.canonicalVenueId,
      displayName: canonicalVenue.displayName,
      primaryFamilypilotPlaceId: canonicalVenue.primaryFamilypilotPlaceId,
      reviewStatus: canonicalVenue.reviewStatus,
      members: [],
    };

    group.members.push({
      familypilotPlaceId: link.familypilotPlaceId,
      linkType: link.linkType,
      matchMethod: link.matchMethod,
      matchConfidence: link.matchConfidence,
    });
    groups.set(link.canonicalVenueId, group);
  }

  return [...groups.values()].filter((group) => group.members.length > 1);
}

module.exports = {
  loadCanonicalStore,
  invalidateCanonicalCache,
  getCanonicalVenueForPlace,
  resolvePrimaryPlaceId,
  getCanonicalIdentity,
  shouldSuppressPlaceId,
  filterPlacesToCanonicalPrimaries,
  upsertHeuristicLink,
  recordAliasPairs,
  listDuplicateGroups,
};
