#!/usr/bin/env node
/**
 * Audit pending enrichment drafts for unsupported positive claims.
 * Does not approve or publish anything.
 *
 * Usage:
 *   ENRICHMENT_ADMIN_TOKEN=... node scripts/audit-enrichment-drafts.mjs
 *   ENRICHMENT_ADMIN_TOKEN=... node scripts/audit-enrichment-drafts.mjs --sample=harry-potter,verulamium
 */

import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { enrichmentFetch, getConfig } from './enrichment-api-client.mjs';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const {
  isQuestionOnlyEvidence,
  isSuspiciousEmbeddedContent,
  isScopedToiletClosure,
  hasVenueWideToiletAbsence,
  hasToiletNegation,
} = require(join(root, 'api/enrichment/_lib/evidence-extractor.js'));

const PRIORITY_VENUE_PATTERNS = [
  { key: 'harry-potter', pattern: /harry potter|warner bros/i },
  { key: 'chiltern', pattern: /chiltern open air/i },
  { key: 'verulamium', pattern: /verulamium/i },
  { key: 'golders-hill', pattern: /golders hill/i },
  { key: 'hanwell', pattern: /hanwell zoo/i },
];

const FIELD_PATHS = [
  ['familyFacilities.toilets', 'toilets'],
  ['familyFacilities.babyChanging', 'babyChanging'],
  ['familyFacilities.parking', 'parking'],
  ['familyFacilities.cafe', 'cafe'],
  ['familyFacilities.playground', 'playground'],
  ['pushchairSuitability', 'pushchairSuitability'],
  ['environment', 'environment'],
  ['accessibility.wheelchairAccessible', 'wheelchairAccessible'],
  ['accessibility.accessibleToilet', 'accessibleToilet'],
  ['sendInfo.sensoryFriendlySessions', 'sensoryFriendlySessions'],
];

function getNestedValue(obj, path) {
  return path.split('.').reduce((acc, key) => (acc && acc[key] != null ? acc[key] : null), obj);
}

function classifyDraftField(fieldKey, field) {
  const warnings = [];
  const value = field?.value ?? 'unknown';
  const confidence = field?.confidence ?? 'unknown';
  const evidence = field?.evidence ?? field?.evidenceText ?? null;
  const sourceUrl = field?.sourceUrl ?? null;
  const sourceType = field?.sourceType ?? null;
  const evidenceBacked = Boolean(field?.evidenceBacked);
  const retrievedAt = field?.retrievedAt ?? null;

  if (value === 'unknown') {
    return {
      passed: true,
      classification: 'unknown',
      confidence,
      warnings,
    };
  }

  if (!evidence || String(evidence).trim().length < 8) {
    warnings.push('missing_or_short_evidence');
  }

  if (!sourceUrl) {
    warnings.push('missing_source_url');
  }

  const hasOfficialMergeReason = field?.reason === 'Supported by official source evidence.';
  if ((value === 'yes' || value === 'no') && !evidenceBacked && !hasOfficialMergeReason) {
    warnings.push('not_marked_evidence_backed');
  }

  if (evidence && isQuestionOnlyEvidence(evidence)) {
    warnings.push('question_only_evidence');
  }

  if (evidence && isSuspiciousEmbeddedContent(evidence)) {
    warnings.push('embedded_transport_content');
  }

  if (fieldKey === 'toilets' && value === 'no') {
    if (evidence && isScopedToiletClosure(evidence) && !hasVenueWideToiletAbsence(evidence)) {
      warnings.push('scoped_toilet_closure_treated_as_venue_wide_no');
    }
    if (evidence && hasToiletNegation(evidence) && !hasVenueWideToiletAbsence(evidence)) {
      warnings.push('toilet_negation_without_venue_wide_absence');
    }
  }

  const unsupportedPositive =
    (value === 'yes' || (fieldKey === 'pushchairSuitability' && value !== 'unknown' && value !== 'difficult')) &&
    (
      warnings.includes('missing_or_short_evidence') ||
      warnings.includes('missing_source_url') ||
      warnings.includes('question_only_evidence') ||
      warnings.includes('embedded_transport_content') ||
      warnings.includes('scoped_toilet_closure_treated_as_venue_wide_no') ||
      warnings.includes('toilet_negation_without_venue_wide_absence')
    );

  const passed = !unsupportedPositive && !(value === 'no' && warnings.includes('toilet_negation_without_venue_wide_absence'));

  return {
    passed,
    classification: value,
    confidence,
    warnings,
    unsupportedPositive,
  };
}

function auditEvidenceBundleConflicts(bundle) {
  const rows = [];
  for (const fact of bundle?.facts ?? []) {
    if (fact.evidenceStatus === 'conflict') {
      rows.push({
        field: fact.field,
        classification: 'conflict_unknown',
        confidence: fact.confidence ?? 'unknown',
        evidence: null,
        source: null,
        passed: true,
        warnings: ['source_conflict_preserved_as_unknown'],
        conflicts: (fact.conflicts ?? []).map((item) => ({
          value: item.value,
          sourceUrl: item.sourceUrl ?? null,
          evidenceText: item.evidenceText ?? null,
        })),
      });
    }
  }
  return rows;
}

function extractDraftRows(venueName, draftJson, evidenceBundle) {
  const rows = [];

  for (const [path, fieldKey] of FIELD_PATHS) {
    const field = getNestedValue(draftJson, path);
    if (!field) continue;
    const audit = classifyDraftField(fieldKey, field);
    if (field.value === 'unknown' && !field.evidence && audit.warnings.length === 0) continue;

    rows.push({
      venue: venueName,
      proposedFact: fieldKey,
      evidence: field.evidence ?? field.evidenceText ?? null,
      source: field.sourceUrl ?? null,
      sourceType: field.sourceType ?? null,
      classification: audit.classification,
      confidence: audit.confidence,
      passedQualityGate: audit.passed,
      warnings: audit.warnings,
      unsupportedPositive: Boolean(audit.unsupportedPositive),
      retrievedAt: field.retrievedAt ?? null,
    });
  }

  for (const conflictRow of auditEvidenceBundleConflicts(evidenceBundle)) {
    rows.push({
      venue: venueName,
      proposedFact: conflictRow.field,
      evidence: null,
      source: null,
      sourceType: null,
      classification: conflictRow.classification,
      confidence: conflictRow.confidence,
      passedQualityGate: conflictRow.passed,
      warnings: conflictRow.warnings,
      unsupportedPositive: false,
      conflicts: conflictRow.conflicts,
      retrievedAt: null,
    });
  }

  return rows;
}

function parseSampleArg(argv) {
  const sampleArg = argv.find((arg) => arg.startsWith('--sample='));
  if (!sampleArg) return null;
  return sampleArg.slice('--sample='.length).split(',').map((s) => s.trim()).filter(Boolean);
}

function matchesSample(name, sampleKeys) {
  if (!sampleKeys?.length) return true;
  return sampleKeys.some((key) => {
    const known = PRIORITY_VENUE_PATTERNS.find((item) => item.key === key);
    return known ? known.pattern.test(name) : name.toLowerCase().includes(key);
  });
}

async function loadVenueAuditRow(item) {
  const payload = await enrichmentFetch('venue', { query: { id: item.familypilotId } });
  const draftJson = payload.draft?.draftJson ?? payload.draft?.draft_json ?? null;
  const evidenceBundle =
    payload.draft?.sourceContext?.evidenceBundle ??
    payload.evidence?.bundle ??
    payload.draft?.source_context?.evidenceBundle ??
    null;

  if (!draftJson) {
    return [{
      venue: item.name,
      proposedFact: '(draft)',
      evidence: null,
      source: null,
      classification: 'missing_draft',
      confidence: 'unknown',
      passedQualityGate: false,
      warnings: ['no_pending_draft'],
      unsupportedPositive: false,
    }];
  }

  return extractDraftRows(item.name, draftJson, evidenceBundle);
}

function toMarkdownTable(rows) {
  const headers = [
    'Venue',
    'Proposed fact',
    'Evidence',
    'Source',
    'Classification',
    'Confidence',
    'Passed quality gate',
    'Warnings / conflicts',
  ];

  const escape = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

  const lines = [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
  ];

  for (const row of rows) {
    const warningText = [
      ...(row.warnings ?? []),
      ...(row.conflicts ?? []).map((c) => `conflict:${c.value}@${c.sourceUrl ?? 'unknown'}`),
    ].join('; ');

    lines.push(
      `| ${[
        escape(row.venue),
        escape(row.proposedFact),
        escape(row.evidence),
        escape(row.source),
        escape(row.classification),
        escape(row.confidence),
        row.passedQualityGate ? 'yes' : 'no',
        escape(warningText),
      ].join(' | ')} |`,
    );
  }

  return lines.join('\n');
}

async function main() {
  const config = await getConfig();
  console.log('Enrichment config:', config);

  const sampleKeys = parseSampleArg(process.argv.slice(2));
  const { items } = await enrichmentFetch('queue', {
    query: { status: 'ai_draft', sort: 'alphabetical' },
  });

  const candidates = (items ?? [])
    .filter((item) => item.hasAiDraft !== false)
    .filter((item) => matchesSample(item.name, sampleKeys));

  console.log(`Auditing ${candidates.length} pending draft venue(s)...`);

  const rows = [];
  for (const item of candidates) {
    const venueRows = await loadVenueAuditRow(item);
    rows.push(...venueRows);
  }

  const unsupported = rows.filter((row) => row.unsupportedPositive);
  const summary = {
    generatedAt: new Date().toISOString(),
    venueCount: candidates.length,
    rowCount: rows.length,
    unsupportedPositiveCount: unsupported.length,
    passedCount: rows.filter((row) => row.passedQualityGate).length,
    failedCount: rows.filter((row) => !row.passedQualityGate).length,
    rows,
  };

  const jsonPath = join(root, 'docs/audit-enrichment-drafts.json');
  const mdPath = join(root, 'docs/audit-enrichment-drafts.md');
  writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
  writeFileSync(mdPath, `# Enrichment draft audit\n\nGenerated: ${summary.generatedAt}\n\n${toMarkdownTable(rows)}\n`);

  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
  console.log(`Unsupported positives: ${unsupported.length}`);

  if (unsupported.length > 0) {
    for (const row of unsupported) {
      console.log(`- ${row.venue} · ${row.proposedFact} · ${row.warnings.join(', ')}`);
    }
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
