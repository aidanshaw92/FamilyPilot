const { createClient } = require('@supabase/supabase-js');

let adminClient = null;

function isSupabaseConfigured() {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

function getSupabaseAdmin() {
  if (!isSupabaseConfigured()) return null;
  if (!adminClient) {
    adminClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return adminClient;
}

module.exports = { getSupabaseAdmin, isSupabaseConfigured };
