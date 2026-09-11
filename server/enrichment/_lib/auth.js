function normalizeToken(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/^\uFEFF/, '').trim().replace(/^['"]|['"]$/g, '');
}

function readHeaderValue(value) {
  if (typeof value === 'string') return normalizeToken(value);
  if (Array.isArray(value)) {
    for (const entry of value) {
      const normalized = normalizeToken(entry);
      if (normalized) return normalized;
    }
  }
  return '';
}

function getTokenFromRequest(req) {
  const headers = req.headers ?? {};

  const custom = readHeaderValue(headers['x-enrichment-token']);
  if (custom) return custom;

  const authorization = readHeaderValue(headers.authorization);
  if (authorization.startsWith('Bearer ')) return normalizeToken(authorization.slice(7));

  return null;
}

function getAdminToken() {
  return normalizeToken(process.env.ENRICHMENT_ADMIN_TOKEN ?? '');
}

function isAuthConfigured() {
  return Boolean(getAdminToken());
}

function verifyEnrichmentAuth(req, res) {
  const expected = getAdminToken();
  if (!expected) {
    res.status(503).json({
      error: 'Enrichment admin token not configured on server',
      code: 'AUTH_NOT_CONFIGURED',
    });
    return false;
  }

  const provided = getTokenFromRequest(req);
  if (!provided) {
    res.status(401).json({ error: 'Unauthorized', code: 'MISSING_TOKEN' });
    return false;
  }

  if (provided !== expected) {
    res.status(401).json({ error: 'Unauthorized', code: 'TOKEN_MISMATCH' });
    return false;
  }

  return true;
}

module.exports = {
  verifyEnrichmentAuth,
  isAuthConfigured,
  getAdminToken,
  getTokenFromRequest,
  normalizeToken,
};
