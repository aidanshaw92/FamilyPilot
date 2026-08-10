#!/usr/bin/env node
/**
 * Compare committed Supabase migrations against optional live production schema.
 *
 * Usage:
 *   node scripts/audit-migration-drift.mjs
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/audit-migration-drift.mjs --live
 */

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const migrationsDir = join(root, 'familypilot/supabase/migrations');
const require = createRequire(import.meta.url);

const EXPECTED_TABLES = [
  'place_records',
  'venue_family_metadata',
  'venue_enrichment_drafts',
  'venue_source_evidence',
  'venue_claims',
  'venue_enrichment_jobs',
  'canonical_venues',
  'venue_place_links',
];

const LEGACY_TABLES = ['venues', 'venue_facilities', 'venue_photos', 'venue_scores'];

function listMigrationFiles() {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

function extractCreatedTables(sql) {
  const tables = [];
  const regex = /CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/gi;
  let match;
  while ((match = regex.exec(sql)) !== null) {
    tables.push(match[1]);
  }
  return tables;
}

function buildRepoSchemaInventory() {
  const files = listMigrationFiles();
  const tables = new Set();
  const byMigration = [];

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    const created = extractCreatedTables(sql);
    for (const table of created) tables.add(table);
    byMigration.push({ file, created });
  }

  return { files, tables: [...tables].sort(), byMigration };
}

async function fetchLiveTables() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for --live audit');
  }

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public');

  if (error) {
    // information_schema may be blocked; fall back to probing expected tables
    const present = [];
    for (const table of EXPECTED_TABLES) {
      const probe = await supabase.from(table).select('*', { count: 'exact', head: true });
      if (!probe.error) present.push(table);
    }
    return { mode: 'probe', tables: present.sort() };
  }

  return {
    mode: 'information_schema',
    tables: (data ?? []).map((row) => row.table_name).sort(),
  };
}

function diffSchemas(repoTables, liveTables) {
  const missingInLive = repoTables.filter((table) => !liveTables.includes(table));
  const extraInLive = liveTables.filter(
    (table) => !repoTables.includes(table) && !LEGACY_TABLES.includes(table),
  );
  return { missingInLive, extraInLive };
}

async function main() {
  const live = process.argv.includes('--live');
  const inventory = buildRepoSchemaInventory();
  const report = {
    generatedAt: new Date().toISOString(),
    migrationFiles: inventory.files,
    migrationCount: inventory.files.length,
    tablesFromMigrations: inventory.tables,
    expectedOperationalTables: EXPECTED_TABLES,
    bootstrapCoversThrough: '003 only — see familypilot/supabase/BOOTSTRAP_FRESH_SUPABASE.sql',
    knownGaps: [
      '001_initial_schema.sql legacy venues model coexists with place_records stack',
      'BOOTSTRAP_FRESH_SUPABASE.sql does not include migrations 004-014',
      '012_enable_automatic_enrichment_schedule.sql hard-codes production Supabase project URL',
      'place_record_id on venue_family_metadata is unused in application code',
    ],
    live: null,
    drift: null,
  };

  if (live) {
    const liveSchema = await fetchLiveTables();
    report.live = liveSchema;
    report.drift = diffSchemas(EXPECTED_TABLES, liveSchema.tables);
  }

  const outJson = join(root, 'docs/schema-migration-audit.json');
  const outMd = join(root, 'docs/SCHEMA_MIGRATION_AUDIT.md');

  writeFileSync(outJson, JSON.stringify(report, null, 2));

  const md = [
    '# Schema migration audit',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Committed migrations',
    '',
    ...inventory.byMigration.map((entry) => `- ${entry.file}: ${entry.created.join(', ') || '(no create tables)'}`),
    '',
    '## Expected operational tables',
    '',
    ...EXPECTED_TABLES.map((table) => `- ${table}`),
    '',
    '## Known repository gaps',
    '',
    ...report.knownGaps.map((gap) => `- ${gap}`),
    '',
  ];

  if (report.live) {
    md.push('## Live production tables', '', ...report.live.tables.map((table) => `- ${table}`), '');
    md.push(
      '## Drift vs expected operational tables',
      '',
      `Missing in live: ${report.drift.missingInLive.join(', ') || 'none'}`,
      '',
      `Extra in live: ${report.drift.extraInLive.join(', ') || 'none'}`,
      '',
    );
  } else {
    md.push(
      '## Live audit',
      '',
      'Run with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` plus `--live` to compare production.',
      '',
    );
  }

  writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outJson}`);
  console.log(`Wrote ${outMd}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
