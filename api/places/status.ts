import type { VercelRequest, VercelResponse } from '@vercel/node';

import { getPlacesRuntimeStatus, searchPlaces } from '../../familypilot/server/places/places-service';
import { checkProviderHealth } from '../../familypilot/server/places/provider-factory';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const runtime = getPlacesRuntimeStatus();
  const health = await checkProviderHealth(runtime.configuredProvider);

  const lat = Number(req.query.lat ?? 51.643);
  const lng = Number(req.query.lng ?? -0.36);
  const radiusKm = Number(req.query.radiusKm ?? 5);

  let probe = null;
  try {
    const result = await searchPlaces({ latitude: lat, longitude: lng, radiusKm });
    probe = {
      provider: result.provider,
      configuredProvider: runtime.configuredProvider,
      fallbackUsed: result.fallbackUsed,
      fallbackReason: result.fallbackReason,
      cached: result.cached,
      fetchedAt: result.fetchedAt,
      resultCount: result.places.length,
      sampleNames: result.places.slice(0, 5).map((p) => p.name),
      sampleProviders: [...new Set(result.places.slice(0, 10).map((p) => p.provider))],
      sampleExternalIds: result.places.slice(0, 3).map((p) => p.externalId),
    };
  } catch (error) {
    probe = {
      error: error instanceof Error ? error.message : 'Probe search failed',
    };
  }

  return res.status(200).json({
    runtime,
    health,
    probe,
    timestamp: new Date().toISOString(),
  });
}
