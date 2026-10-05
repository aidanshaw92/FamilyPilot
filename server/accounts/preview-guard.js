/**
 * Accounts exist on production only.
 *
 * There is one Supabase project, and it is production. On a Vercel PREVIEW deployment (`VERCEL_ENV === 'preview'`)
 * every endpoint that signs someone in, reads or writes an account's data, or creates an invitation refuses, whatever
 * environment variables the preview happens to have been given. The client already ships no account UI on a preview
 * (src/services/supabase/client.ts); this is the same rule where it cannot be bypassed by calling the API directly.
 *
 * Local runs, CI and the fixture servers have no VERCEL_ENV and are unaffected.
 */
function accountsAllowedHere(env = process.env) {
  return env.VERCEL_ENV !== 'preview';
}

const PREVIEW_MESSAGE = 'Accounts are only available on the live site, not on preview deployments.';

/** Sends the refusal and returns true when this deployment must not touch accounts. */
function refuseOnPreview(res, env = process.env) {
  if (accountsAllowedHere(env)) return false;
  res.status(503).json({ error: PREVIEW_MESSAGE, code: 'accounts_disabled_on_preview' });
  return true;
}

module.exports = { accountsAllowedHere, refuseOnPreview, PREVIEW_MESSAGE };
