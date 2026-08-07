import type { VercelRequest, VercelResponse } from '@vercel/node';

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const OVERPASS_USER_AGENT = 'FamilyPilot/1.0 (https://family-pilot-seven.vercel.app; places-api)';

async function probeOsm(lat: number, lng: number): Promise<{
  ok: boolean;
  count: number;
  sampleNames: string[];
  error?: string;
}> {
  const query = `[out:json][timeout:15];node["amenity"="restaurant"](around:5000,${lat},${lng});out center 5;`;
  try {
    const response = await fetch(OVERPASS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': OVERPASS_USER_AGENT,
        Accept: 'application/json',
      },
      body: new URLSearchParams({ data: query }).toString(),
    });
    if (!response.ok) {
      return { ok: false, count: 0, sampleNames: [], error: `Overpass HTTP ${response.status}` };
    }
    const data = (await response.json()) as { elements: { tags?: { name?: string } }[] };
    const names = data.elements.map((e) => e.tags?.name).filter(Boolean) as string[];
    return { ok: true, count: names.length, sampleNames: names.slice(0, 5) };
  } catch (error) {
    return {
      ok: false,
      count: 0,
      sampleNames: [],
      error: error instanceof Error ? error.message : 'Probe failed',
    };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const configuredProvider = (process.env.PLACES_PROVIDER ?? 'mock').toLowerCase();
  const lat = Number(req.query.lat ?? 51.643);
  const lng = Number(req.query.lng ?? -0.36);

  let probe = null;
  if (configuredProvider === 'osm') {
    probe = await probeOsm(lat, lng);
  }

  return res.status(200).json({
    runtime: {
      configuredProvider,
      envPlacesProvider: process.env.PLACES_PROVIDER,
      nodeVersion: process.version,
    },
    probe,
    timestamp: new Date().toISOString(),
  });
}
