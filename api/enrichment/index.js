const { searchGoogle, getGooglePlace } = require('../places/lib/google-places');
const { verifyEnrichmentAuth, isAuthConfigured } = require('./_lib/auth');
const {
  listQueue,
  getStats,
  getStorageMode,
  upsertPlaceRecords,
  upsertPlaceRecord,
  reclassifyProviderOnlyPlaceRecords,
  getMetadata,
  saveMetadata,
} = require('./_lib/enrichment-store');
const { sanitizePayload } = require('./_lib/validation');

function setCorsHeaders(res, methods) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', `${methods}, OPTIONS`);
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Enrichment-Token');
}

module.exports = async function handler(req, res) {
  const action = req.query.action || req.body?.action;

  if (req.method === 'OPTIONS') {
    setCorsHeaders(res, 'GET, POST, PUT');
    return res.status(204).end();
  }

  if (!action) {
    return res.status(400).json({ error: 'Missing action parameter' });
  }

  switch (action) {
    case 'config':
      return handleConfig(req, res);
    case 'queue':
      return handleQueue(req, res);
    case 'stats':
      return handleStats(req, res);
    case 'sync':
      return handleSync(req, res);
    case 'venue':
      return handleVenue(req, res);
    case 'export':
      return handleExport(req, res);
    default:
      return res.status(400).json({ error: `Unknown action: ${action}` });
  }
};

async function handleConfig(req, res) {
  setCorsHeaders(res, 'GET');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  return res.status(200).json({
    authConfigured: isAuthConfigured(),
    storageMode: getStorageMode(),
  });
}

async function handleQueue(req, res) {
  setCorsHeaders(res, 'GET');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!verifyEnrichmentAuth(req, res)) return;

  const status = req.query.status;
  const sort = req.query.sort || 'newest';
  const betaLat = req.query.betaLat != null ? Number(req.query.betaLat) : undefined;
  const betaLng = req.query.betaLng != null ? Number(req.query.betaLng) : undefined;
  const betaRadiusKm = req.query.betaRadiusKm != null ? Number(req.query.betaRadiusKm) : undefined;

  try {
    const items = await listQueue({
      status: status || undefined,
      sort,
      betaLat,
      betaLng,
      betaRadiusKm,
      provider: 'google',
    });
    return res.status(200).json({ items, count: items.length });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Queue load failed',
    });
  }
}

async function handleStats(req, res) {
  setCorsHeaders(res, 'GET');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!verifyEnrichmentAuth(req, res)) return;

  try {
    const stats = await getStats();
    return res.status(200).json({ stats, storageMode: getStorageMode() });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Stats load failed',
    });
  }
}

async function handleSync(req, res) {
  setCorsHeaders(res, 'POST');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!verifyEnrichmentAuth(req, res)) return;

  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  const radiusKm = Number(req.body?.radiusKm ?? 15);
  const intent = req.body?.intent === 'restaurant' ? 'restaurant' : 'explore';

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }

  try {
    const places = await searchGoogle(lat, lng, radiusKm, { intent });
    await upsertPlaceRecords(places);
    const reclassified = await reclassifyProviderOnlyPlaceRecords();
    return res.status(200).json({
      synced: places.length,
      reclassified,
      places: places.map((p) => ({
        familypilotId: p.familypilotId,
        name: p.name,
        category: p.category,
      })),
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Sync failed',
    });
  }
}

async function handleVenue(req, res) {
  setCorsHeaders(res, 'GET, PUT');
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  if (req.method === 'GET') {
    if (!verifyEnrichmentAuth(req, res)) return;
    try {
      let place = null;
      if (id.startsWith('fp-google-')) {
        place = await getGooglePlace(id);
        if (place) await upsertPlaceRecord(place);
      }
      const metadata = await getMetadata(id);
      return res.status(200).json({ place, metadata });
    } catch (error) {
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Load failed',
      });
    }
  }

  if (req.method === 'PUT') {
    if (!verifyEnrichmentAuth(req, res)) return;
    try {
      const payload = sanitizePayload(req.body);
      const metadata = await saveMetadata(id, payload);
      return res.status(200).json({ metadata, saved: true });
    } catch (error) {
      if (error.code === 'VALIDATION_ERROR') {
        return res.status(400).json({
          error: error.message,
          missing: error.missing,
          code: 'VALIDATION_ERROR',
        });
      }
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Save failed',
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleExport(req, res) {
  setCorsHeaders(res, 'GET');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!verifyEnrichmentAuth(req, res)) return;

  try {
    const items = await listQueue({ provider: 'google' });
    const header = [
      'familypilotId',
      'externalId',
      'name',
      'category',
      'enrichmentStatus',
      'lastChecked',
      'sourceType',
    ];
    const rows = items.map((item) =>
      [
        item.familypilotId,
        item.externalId,
        `"${item.name.replace(/"/g, '""')}"`,
        item.category,
        item.enrichmentStatus,
        item.lastChecked || '',
        item.sourceType || '',
      ].join(','),
    );
    const csv = [header.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="enrichment-export.csv"');
    return res.status(200).send(csv);
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Export failed',
    });
  }
}
