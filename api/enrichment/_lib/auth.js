function getTokenFromRequest(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  const custom = req.headers['x-enrichment-token'];
  if (typeof custom === 'string') return custom.trim();
  return null;
}

function getAdminToken() {
  return process.env.ENRICHMENT_ADMIN_TOKEN || '';
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
  if (!provided || provided !== expected) {
    res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    return false;
  }

  return true;
}

module.exports = { verifyEnrichmentAuth, isAuthConfigured, getAdminToken };
