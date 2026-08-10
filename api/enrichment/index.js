const { searchGoogle, getGooglePlace } = require('../places/lib/google-places');
const { verifyEnrichmentAuth, isAuthConfigured } = require('./_lib/auth');
const { consumeAutomationDispatch } = require('./_lib/automation-store');
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
const { isAiConfigured } = require('./_lib/ai-provider');
const {
  generateDraftForVenue,
  generateDraftBatch,
  listLegacyPendingDrafts,
  getPendingDraft,
  approveDraft,
  rejectDraft,
} = require('./_lib/draft-store');
const { listEvidenceForVenue } = require('./_lib/evidence-store');

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
    case 'generate-draft':
      return handleGenerateDraft(req, res);
    case 'automation-run':
      return handleAutomationRun(req, res);
    case 'generate-batch':
      return handleGenerateBatch(req, res);
    case 'legacy-drafts':
      return handleLegacyDrafts(req, res);
    case 'draft':
      return handleDraft(req, res);
    case 'approve-draft':
      return handleApproveDraft(req, res);
    case 'reject-draft':
      return handleRejectDraft(req, res);
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
    aiConfigured: isAiConfigured(),
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

  const betaLat = req.query.betaLat != null ? Number(req.query.betaLat) : undefined;
  const betaLng = req.query.betaLng != null ? Number(req.query.betaLng) : undefined;
  const betaRadiusKm = req.query.betaRadiusKm != null ? Number(req.query.betaRadiusKm) : undefined;

  try {
    const stats = await getStats({
      betaLat,
      betaLng,
      betaRadiusKm,
      provider: 'google',
    });
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
      const draft = await getPendingDraft(id);
      const evidence = await listEvidenceForVenue(id);
      return res.status(200).json({ place, metadata, draft, evidence });
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
      const metadata = await saveMetadata(id, payload, { syncClaims: true });
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

async function handleGenerateDraft(req, res) {
  setCorsHeaders(res, 'POST');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!verifyEnrichmentAuth(req, res)) return;

  const id = req.body?.id || req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing venue id' });

  try {
    const result = await generateDraftForVenue(id, { regenerate: Boolean(req.body?.regenerate) });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Draft generation failed',
    });
  }
}

async function handleAutomationRun(req, res) {
  setCorsHeaders(res, 'POST');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const id = req.body?.id;
  const jobId = req.body?.jobId;
  const dispatchToken = req.body?.dispatchToken;
  if (!id || !jobId || !dispatchToken) {
    return res.status(400).json({ error: 'Missing automation dispatch data' });
  }

  try {
    const authorized = await consumeAutomationDispatch(jobId, dispatchToken, id);
    if (!authorized) {
      return res.status(401).json({ error: 'Invalid or expired automation dispatch' });
    }

    const result = await generateDraftForVenue(id, { regenerate: Boolean(req.body?.regenerate) });
    return res.status(200).json({
      ok: true,
      venueId: id,
      draftId: result.draft?.id,
      evidenceStatus: result.draft?.evidenceStatus,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Automated draft generation failed',
    });
  }
}

async function handleGenerateBatch(req, res) {
  setCorsHeaders(res, 'POST');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!verifyEnrichmentAuth(req, res)) return;

  try {
    const result = await generateDraftBatch(req.body ?? {});
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Batch generation failed',
    });
  }
}

async function handleLegacyDrafts(req, res) {
  setCorsHeaders(res, 'GET');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!verifyEnrichmentAuth(req, res)) return;

  const batchSize = req.query.batchSize != null ? Number(req.query.batchSize) : undefined;

  try {
    const items = await listLegacyPendingDrafts({
      batchSize,
      provider: 'google',
    });
    return res.status(200).json({ items, count: items.length });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Legacy draft listing failed',
    });
  }
}

async function handleDraft(req, res) {
  setCorsHeaders(res, 'GET');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!verifyEnrichmentAuth(req, res)) return;

  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  try {
    const draft = await getPendingDraft(id);
    return res.status(200).json({ draft });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Draft load failed',
    });
  }
}

async function handleApproveDraft(req, res) {
  setCorsHeaders(res, 'POST');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!verifyEnrichmentAuth(req, res)) return;

  const id = req.body?.id || req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing venue id' });

  try {
    const payload = req.body?.payload ? sanitizePayload(req.body.payload) : {};
    const reviewedBy = req.body?.reviewedBy || 'enrichment-admin';
    const result = await approveDraft(id, payload, reviewedBy);
    return res.status(200).json(result);
  } catch (error) {
    if (error.code === 'VALIDATION_ERROR') {
      return res.status(400).json({
        error: error.message,
        missing: error.missing,
        code: 'VALIDATION_ERROR',
      });
    }
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Approve failed',
    });
  }
}

async function handleRejectDraft(req, res) {
  setCorsHeaders(res, 'POST');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!verifyEnrichmentAuth(req, res)) return;

  const id = req.body?.id || req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing venue id' });

  try {
    const reviewedBy = req.body?.reviewedBy || 'enrichment-admin';
    const result = await rejectDraft(id, reviewedBy);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Reject failed',
    });
  }
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
