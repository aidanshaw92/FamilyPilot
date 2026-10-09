import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const req = createRequire(import.meta.url);
const root = join(__dirname, '..', '..');
const V = join(root, '..', 'docs/pilot/beta/verification');
const { verifyChain } = req('../../scripts/pilot/review-audit.cjs') as { verifyChain: (e: unknown[]) => { ok: boolean } };
const record = JSON.parse(readFileSync(join(V, 'packC-ai-verification.json'), 'utf8')) as { classification: string; founderApproval: string; claims: Array<{ itemId: string; decision: string; companion?: boolean; original: string; publish: null | { kind: string; wording: string; field?: string; label?: string }; removed: string[]; source: { url: string; exactQuote: string; officialVenueDomain: boolean; quoteCheckedAgainst: string } }> };
const chain = readFileSync(join(V, 'audit-packC-ai.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

describe('Pack C AI-assisted source verification', () => {
  it('is classified as AI-assisted and awaiting the founder, never as human review or a passed control check', () => {
    expect(record.classification).toMatch(/AI-assisted source verification, awaiting founder approval/);
    expect(record.classification).toMatch(/NOT independent human-reviewed evidence/);
    expect(record.classification).toMatch(/NOT a passed Pack C control check/);
    expect(record.founderApproval).toBe('pending');
    for (const e of chain) { expect(e.reviewer).toMatch(/^ai-assisted-source-verification/); expect(e.reviewer).not.toMatch(/^human:/); }
  });

  it('has an intact tamper-evident chain covering the nine claims and five companion decisions', () => {
    expect(verifyChain(chain).ok).toBe(true);
    expect(chain).toHaveLength(14);
    expect(record.claims.filter((c) => !c.companion)).toHaveLength(9);
  });

  it('every source is the venue\'s own domain and every quotation was found', () => {
    for (const c of record.claims) { expect(c.source.officialVenueDomain).toBe(true); expect(c.source.exactQuote.length).toBeGreaterThan(20); }
  });

  it('removes the three wordings the founder named, and never turns accessible toilets into general toilets', () => {
    const by = (id: string) => record.claims.find((c) => c.itemId.endsWith(id))!;
    expect(by(':activities.the-garden').publish!.wording).not.toMatch(/hands-on|play gallery/i);
    expect(by(':activities.zootown').publish!.wording).not.toMatch(/book|advance|£1/i);
    expect(by(':activities.zootown').removed.join(' ')).toMatch(/contradicts itself/);
    for (const venue of ['ChIJP9oAE0MFdkgR3iKGFKZO1SE', 'ChIJV_iXMtcadkgRqBI84CY_crE']) {
      expect(by(`${venue}:toilets.toilets`.slice(0)).decision).toBe('unknown');
      expect(record.claims.find((c) => c.itemId === `${venue}:toilets.accessibleToilet`)!.publish!.field).toBe('accessibility.accessibleToilet');
    }
  });

  it('builds a draft manifest that labels Pack C separately, writes no human: approver for it, and projects four ready venues', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'ai-')), 'draft');
    const r = spawnSync('node', [join(root, 'scripts/pilot/build-final-manifest.cjs'), '--ab', join(root, '..', 'docs/pilot/beta/decisions/audit-packAB.jsonl'), '--ai-verified', join(V, 'audit-packC-ai.jsonl'), '--approver', 'human:founder-test', '--review-basis', 'test basis', '--out-dir', out, '--as-of', '2026-10-09'], { encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    const md = readFileSync(join(out, 'MANIFEST.md'), 'utf8');
    expect(md).toMatch(/## 1a\. Founder-reviewed claims, Packs A and B \(15\)/);
    expect(md).toMatch(/## 1b\. AI-assisted source-verified claims, Pack C, awaiting your approval \(10\)/);
    expect(md).toMatch(/NOT a passed Pack C control check/);
    for (const v of ['Royal Air Force Museum London', 'Horniman Museum and Gardens', 'London Zoo', 'Science Museum']) expect(md).toContain(`| ${v} | **recommendation-ready**`);
    expect(md).toMatch(/Discover Children's Story Centre \| not ready \| cost/);
    const sql = readFileSync(join(out, 'claims/apply.sql'), 'utf8');
    expect(sql.match(/'source_verified_ai_v1'/g)!.length).toBeGreaterThanOrEqual(10);
    expect(sql.match(/'ai_assisted_source_verification'/g)!.length).toBe(10);
    expect(existsSync(join(out, 'claims/rollback.sql'))).toBe(true);
  });
});
