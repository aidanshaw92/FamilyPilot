const { verifyEnrichmentAuth } = require('./lib/auth');
const { listQueue } = require('./lib/enrichment-store');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Enrichment-Token');

  if (req.method === 'OPTIONS') return res.status(204).end();
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
};
