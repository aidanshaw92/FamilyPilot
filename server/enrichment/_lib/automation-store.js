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

/**
 * The job's own mode, read from the queue row rather than trusted from the request.
 *
 * The edge worker forwards one boolean (`regenerate`), so a mode it does not know collapses to "not regenerate". The
 * API is the one place that holds service credentials and the job id, so it reads the mode itself. A job that cannot
 * be read runs as the plainest mode (`generate`), which is the existing behaviour and spends nothing new.
 */
async function getAutomationJobMode(jobId) {
  if (!jobId) return null;
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('venue_enrichment_jobs')
    .select('mode')
    .eq('id', jobId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.mode ?? null;
}

module.exports = { consumeAutomationDispatch, getAutomationJobMode };
