function getTokenFromRequest(req) {
  const custom = req.headers['x-enrichment-token'];
  if (typeof custom === 'string' && custom.trim()) return custom.trim();

  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();

  return null;
}

function getAdminToken() {
  const token = process.env.ENRICHMENT_ADMIN_TOKEN;
  return typeof token === 'string' ? token.trim() : '';
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

module.exports = { verifyEnrichmentAuth, isAuthConfigured, getAdminToken, getTokenFromRequest };
