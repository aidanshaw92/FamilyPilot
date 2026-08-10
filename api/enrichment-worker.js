const crypto = require('crypto');

const { getSupabaseAdmin, resolveServiceRoleKey } = require('./enrichment/_lib/supabase-admin');
const { generateDraftForVenue } = require('./enrichment/_lib/draft-store');

function secureEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function authorised(req) {
  const expected = resolveServiceRoleKey().trim();
  const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  return Boolean(expected && supplied && secureEqual(expected, supplied));
}

function retryDelayMinutes(attempts) {
  return Math.min(24 * 60, 5 * (2 ** Math.max(0, attempts - 1)));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!authorised(req)) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: 'Supabase is not configured' });

  const { data: jobs, error: claimError } = await supabase.rpc('claim_venue_enrichment_job');
  if (claimError) return res.status(500).json({ error: claimError.message });

  const job = jobs?.[0];
  if (!job) return res.status(200).json({ processed: 0 });

  try {
    const result = await generateDraftForVenue(job.familypilot_place_id, { regenerate: true });
    const { error } = await supabase
      .from('venue_enrichment_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        locked_at: null,
        last_error: null,
        last_draft_id: result.draft.id,
        updated_at: new Date().toISOString(),
      })
      .eq('familypilot_place_id', job.familypilot_place_id);
    if (error) throw new Error(error.message);

    return res.status(200).json({
      processed: 1,
      ok: true,
      familypilotPlaceId: job.familypilot_place_id,
      draftId: result.draft.id,
    });
  } catch (error) {
    const attempts = Number(job.attempts || 1);
    const failed = attempts >= Number(job.max_attempts || 5);
    const availableAt = new Date(Date.now() + retryDelayMinutes(attempts) * 60_000).toISOString();
    const message = error instanceof Error ? error.message : 'Automatic enrichment failed';

    await supabase
      .from('venue_enrichment_jobs')
      .update({
        status: failed ? 'failed' : 'retry',
        available_at: availableAt,
        locked_at: null,
        last_error: message.slice(0, 2000),
        updated_at: new Date().toISOString(),
      })
      .eq('familypilot_place_id', job.familypilot_place_id);

    return res.status(failed ? 200 : 503).json({
      processed: 1,
      ok: false,
      retrying: !failed,
      familypilotPlaceId: job.familypilot_place_id,
      error: message,
    });
  }
};
