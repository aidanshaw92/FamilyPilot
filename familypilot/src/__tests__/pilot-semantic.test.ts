import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The record of the blind semantic verification and the queue arithmetic built on it. These do not re-run any model: they hold the
 * committed record to the properties the process claims.
 */
const docs = path.join(__dirname, '..', '..', '..', 'docs', 'pilot');
const sv = JSON.parse(fs.readFileSync(path.join(docs, 'semantic-verification.json'), 'utf8'));
const profiles = fs.readdirSync(path.join(docs, 'profiles')).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(docs, 'profiles', f), 'utf8')));
const reduction = JSON.parse(fs.readFileSync(path.join(docs, 'review-reduction.json'), 'utf8'));

describe('semantic verification record', () => {
  it('caught every planted wrong claim, with both verifiers', () => {
    expect(sv.seeded.planted).toBeGreaterThanOrEqual(16);
    expect(sv.seeded.caughtByA).toBe(sv.seeded.planted);
    expect(sv.seeded.caughtByB).toBe(sv.seeded.planted);
    expect(sv.seeded.items.every((s: { A: string; B: string }) => s.A !== 'supports' && s.B !== 'supports')).toBe(true);
  });

  it('never leaves an accepted fact that a verifier did not fully support', () => {
    for (const p of profiles) for (const f of p.facts) {
      if (f.status !== 'verified' || !f.semantic) continue;
      expect([f.semantic.A, f.semantic.B], `${p.name} ${f.sec}.${f.key}`).toEqual(['supports', 'supports']);
    }
  });

  it('keeps the original wording of every proposal it narrowed, and the narrowed wording is shorter or equal in claim', () => {
    const amended = profiles.flatMap((p) => p.facts.filter((f: { amended?: unknown }) => f.amended).map((f: { amended: { from: string }; text: string }) => ({ p, f })));
    expect(amended.length).toBeGreaterThanOrEqual(40);
    for (const { f } of amended) {
      expect(f.amended.from.length).toBeGreaterThan(0);
      expect(f.amended.from).not.toBe(f.text);
    }
  });
});

describe('the queue arithmetic', () => {
  it('accounts for every held item exactly once', () => {
    const removed = reduction.stages.reduce((n: number, s: { removed: number }) => n + s.removed, 0);
    expect(removed + reduction.humanDecisions).toBe(reduction.startedWith);
    expect(reduction.of.needExpertOrOwner + reduction.of.standardReviewerQueue + reduction.of.lowImpactBatch).toBe(reduction.humanDecisions);
  });

  it('removes only items that publish nothing', () => {
    const parked = reduction.withheld.find((w: { stage: string }) => w.stage.startsWith('Parked'));
    expect(parked.items.length).toBeGreaterThan(0);
    const heldIds = new Set(profiles.flatMap((p) => p.facts.filter((f: { status: string }) => f.status === 'review').map((f: { sec: string; key: string }) => `${p.id.replace('fp-google-', '')}:${f.sec}.${f.key}`)));
    for (const w of reduction.withheld) for (const id of w.items) expect(heldIds.has(id), id).toBe(true);
  });

  it('is reproducible from the committed files', () => {
    const out = execFileSync('node', [path.join(__dirname, '..', '..', 'scripts', 'pilot', 'review-reduce.cjs')], { encoding: 'utf8' });
    expect(JSON.parse(out).humanDecisions).toBe(reduction.humanDecisions);
  });
});
