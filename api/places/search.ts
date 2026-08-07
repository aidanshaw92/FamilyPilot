import type { VercelRequest, VercelResponse } from '@vercel/node';

import { searchPlaces } from '../../familypilot/server/places/places-service';
import { PlaceSearchParams } from '../../familypilot/src/types/places';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const latitude = Number(req.query.lat);
    const longitude = Number(req.query.lng);
    const radiusKm = Number(req.query.radiusKm ?? 25);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return res.status(400).json({
        error: 'Invalid coordinates',
        code: 'INVALID_PARAMS',
        fallbackAvailable: true,
      });
    }

    const categories = req.query.categories
      ? String(req.query.categories).split(',').filter(Boolean)
      : undefined;

    const params: PlaceSearchParams = {
      latitude,
      longitude,
      radiusKm,
      categories: categories as PlaceSearchParams['categories'],
    };

    const result = await searchPlaces(params);
    return res.status(200).json({
      ...result,
      configuredProvider: process.env.PLACES_PROVIDER ?? 'mock',
    });
  } catch (error) {
    return res.status(503).json({
      error: error instanceof Error ? error.message : 'Places service unavailable',
      code: 'PROVIDER_UNAVAILABLE',
      fallbackAvailable: true,
    });
  }
}
