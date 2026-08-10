#!/usr/bin/env node
/**
 * Apply pending Supabase migrations from familypilot/supabase/migrations/.
 *
 * Usage:
 *   SUPABASE_DB_URL=postgresql://... node scripts/apply-supabase-migrations.mjs 013 014
 *   SUPABASE_DB_URL=postgresql://... node scripts/apply-supabase-migrations.mjs --from 013
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '../familypilot/supabase/migrations');

const POOLER_REGIONS = [
  'eu-west-1',
  'eu-west-2',
  'eu-central-1',
  'us-east-1',
  'us-west-1',
  'ap-southeast-1',
];

function projectRefFromSupabaseUrl() {
  const url = process.env.SUPABASE_URL || '';
  const match = url.match(/^https?:\/\/([^.]+)\.supabase\.co/i);
  return match?.[1] ?? null;
}

/** Recover a usable URI when Cursor redaction corrupts SUPABASE_DB_URL. */
function normalizeDbUrl(raw) {
  if (!raw) return null;
  if (!raw.includes('hidden')) {
    try {
      const parsed = new URL(raw);
      if (parsed.hostname && parsed.hostname !== 'hidden') return raw;
    } catch {
      /* fall through */
    }
  }

  const embedded = raw.match(/postgres:([^@]+)@db\.([^.]+)\.supabase\.co:5432\/postgres/);
  if (!embedded) return null;

  const password = decodeURIComponent(embedded[1]);
  const ref = embedded[2];
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
}

function poolerCandidates(directUrl) {
  const parsed = new URL(directUrl);
  const password = parsed.password;
  const ref = projectRefFromSupabaseUrl() || parsed.hostname.match(/^db\.([^.]+)\.supabase\.co$/)?.[1];
  if (!ref || !password) return [];

  const encoded = encodeURIComponent(decodeURIComponent(password));
  const candidates = [];
  for (const awsPrefix of ['aws-1', 'aws-0']) {
    for (const region of POOLER_REGIONS) {
      for (const port of [5432, 6543]) {
        candidates.push(
          `postgresql://postgres.${ref}:${encoded}@${awsPrefix}-${region}.pooler.supabase.com:${port}/postgres`,
        );
      }
    }
  }
  return candidates;
}

async function connectClient(dbUrl) {
  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });
  await client.connect();
  return client;
}

async function resolveClient(rawUrl) {
  const normalized = normalizeDbUrl(rawUrl);
  const attempts = [];
  if (normalized) attempts.push(normalized);
  if (rawUrl && rawUrl !== normalized) attempts.push(rawUrl);

  const seen = new Set();
  for (const url of attempts) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    try {
      const client = await connectClient(url);
      console.log(`Connected via ${new URL(url).hostname}`);
      return client;
    } catch (error) {
      console.warn(`Direct connection failed (${new URL(url).hostname}): ${error.code ?? error.message}`);
    }

    for (const poolerUrl of poolerCandidates(url)) {
      if (seen.has(poolerUrl)) continue;
      seen.add(poolerUrl);
      try {
        const client = await connectClient(poolerUrl);
        console.log(`Connected via pooler ${new URL(poolerUrl).hostname}`);
        return client;
      } catch {
        /* try next candidate */
      }
    }
  }

  throw new Error(
    'Could not connect to Supabase Postgres. Provide a clean SUPABASE_DB_URL (Session pooler URI recommended) or run migrations manually in the Supabase SQL Editor.',
  );
}

function listMigrationFiles() {
  return fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

function resolveTargets(argv) {
  const all = listMigrationFiles();
  if (argv.includes('--from')) {
    const from = argv[argv.indexOf('--from') + 1];
    return all.filter((file) => file >= `${from}_`);
  }
  const explicit = argv.filter((arg) => /^\d{3}$/.test(arg));
  if (explicit.length === 0) return all;
  return all.filter((file) => explicit.some((id) => file.startsWith(`${id}_`)));
}

async function ensureMigrationLog(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migration_log (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function hasApplied(client, filename) {
  const result = await client.query(
    'SELECT 1 FROM public.schema_migration_log WHERE filename = $1 LIMIT 1',
    [filename],
  );
  return result.rowCount > 0;
}

async function applyMigration(client, filename) {
  const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query(
      'INSERT INTO public.schema_migration_log (filename) VALUES ($1) ON CONFLICT DO NOTHING',
      [filename],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    throw new Error('SUPABASE_DB_URL is not set');
  }

  const targets = resolveTargets(process.argv.slice(2));
  if (targets.length === 0) {
    throw new Error('No migration files matched the requested ids');
  }

  const client = await resolveClient(dbUrl);
  await ensureMigrationLog(client);

  const applied = [];
  const skipped = [];

  for (const filename of targets) {
    if (await hasApplied(client, filename)) {
      skipped.push(filename);
      continue;
    }
    console.log(`Applying ${filename}...`);
    await applyMigration(client, filename);
    applied.push(filename);
    console.log(`Applied ${filename}`);
  }

  await client.end();

  console.log(`Done. Applied: ${applied.length}, skipped: ${skipped.length}`);
  if (applied.length) console.log('Applied files:', applied.join(', '));
  if (skipped.length) console.log('Skipped files:', skipped.join(', '));
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
