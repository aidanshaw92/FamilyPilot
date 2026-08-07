import type { VercelRequest, VercelResponse } from '@vercel/node';

import { getPlaceDetail } from '../../familypilot/server/places/places-service';

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

  const id = req.query.id as string | undefined;
  if (!id) {
    return res.status(400).json({
      error: 'Missing id parameter',
      code: 'INVALID_PARAMS',
      fallbackAvailable: true,
    });
  }

  try {
    const result = await getPlaceDetail(id);
    if (!result) {
      return res.status(404).json({
        error: 'Place not found',
        code: 'NOT_FOUND',
        fallbackAvailable: true,
      });
    }
    return res.status(200).json(result);
  } catch (error) {
    return res.status(503).json({
      error: error instanceof Error ? error.message : 'Places service unavailable',
      code: 'PROVIDER_UNAVAILABLE',
      fallbackAvailable: true,
    });
  }
}
