// Resolve a fresh Google photo reference on demand; never expose the API key.
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).end();
  const id = req.query.id;
  const index = Number(req.query.index || 0);
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(id) || !Number.isInteger(index) || index < 0 || index > 2) return res.status(400).end();
  const key = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return res.status(503).end();
  try {
    const response = await fetch(`https://places.googleapis.com/v1/places/${id}`, {
      headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'photos' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return res.status(502).end();
    const photo = (await response.json()).photos?.[index];
    if (!photo?.name) return res.status(404).end();
    const media = await fetch(`https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=800&skipHttpRedirect=true`, {
      headers: { 'X-Goog-Api-Key': key }, signal: AbortSignal.timeout(8000),
    });
    if (!media.ok) return res.status(502).end();
    const { photoUri } = await media.json();
    const url = new URL(photoUri);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.googleusercontent.com')) return res.status(502).end();
    return res.redirect(302, photoUri);
  } catch { return res.status(502).end(); }
};
