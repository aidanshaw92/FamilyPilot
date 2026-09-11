const { createClient } = require('@supabase/supabase-js');

let adminClient = null;

function decodeJwtRole(key) {
  if (typeof key !== 'string') return null;
  const parts = key.split('.');
  if (parts.length < 2) return null;

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

function resolveServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
}

function isSupabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && resolveServiceRoleKey());
}

function assertServiceRoleKey(key) {
  const role = decodeJwtRole(key);
  if (role === 'service_role') return;

  if (role === 'anon') {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is set to the anon/public key. Use the service_role secret from Supabase Dashboard → Settings → API.',
    );
  }

  if (role) {
    throw new Error(
      `SUPABASE_SERVICE_ROLE_KEY JWT role is "${role}", expected "service_role".`,
    );
  }
}

function getSupabaseAdmin() {
  if (!isSupabaseConfigured()) return null;

  if (!adminClient) {
    const serviceRoleKey = resolveServiceRoleKey().trim();
    assertServiceRoleKey(serviceRoleKey);

    adminClient = createClient(process.env.SUPABASE_URL, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return adminClient;
}

module.exports = {
  getSupabaseAdmin,
  isSupabaseConfigured,
  decodeJwtRole,
  resolveServiceRoleKey,
  assertServiceRoleKey,
};
