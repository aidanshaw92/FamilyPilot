const { getSupabaseAdmin } = require('./supabase-admin');

async function consumeAutomationDispatch(jobId, dispatchToken, venueId) {
  if (!jobId || !dispatchToken || !venueId) return false;
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  const { data, error } = await supabase.rpc('consume_venue_enrichment_dispatch', {
    p_job_id: jobId,
    p_dispatch_token: dispatchToken,
    p_familypilot_place_id: venueId,
  });
  if (error) throw new Error(error.message);
  return data === true;
}

module.exports = { consumeAutomationDispatch };
