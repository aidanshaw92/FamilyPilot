/**
 * Enrichment pilot geography — which venues sync, queue, and batch by default.
 * Override temporarily via ENRICHMENT_BETA_* env vars on Vercel without redeploying code.
 */

/** Mill Hill, London NW7 — 10 mile (~16.1 km) review radius. */
const DEFAULT_BETA_AREA = {
  lat: 51.613,
  lng: -0.249,
  radiusKm: 16.1,
  label: 'Mill Hill',
};

function parseEnvNumber(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function getDefaultBetaArea() {
  return {
    lat: parseEnvNumber('ENRICHMENT_BETA_LAT', DEFAULT_BETA_AREA.lat),
    lng: parseEnvNumber('ENRICHMENT_BETA_LNG', DEFAULT_BETA_AREA.lng),
    radiusKm: parseEnvNumber('ENRICHMENT_BETA_RADIUS_KM', DEFAULT_BETA_AREA.radiusKm),
    label: process.env.ENRICHMENT_BETA_LABEL?.trim() || DEFAULT_BETA_AREA.label,
  };
}

function resolveBetaParams(params = {}) {
  const defaults = getDefaultBetaArea();
  return {
    betaLat: params.betaLat != null ? Number(params.betaLat) : defaults.lat,
    betaLng: params.betaLng != null ? Number(params.betaLng) : defaults.lng,
    betaRadiusKm: params.betaRadiusKm != null ? Number(params.betaRadiusKm) : defaults.radiusKm,
  };
}

module.exports = {
  DEFAULT_BETA_AREA,
  getDefaultBetaArea,
  resolveBetaParams,
};
