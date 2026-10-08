import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The reviewer workflow's rules, held to the committed data. No model is called and nothing is published.
 */
const require = createRequire(import.meta.url);
const wf = require('../../scripts/pilot/review-workflow.cjs');
const { score } = require('../../scripts/pilot/review-session-score.cjs');

interface Row {
  id: string; tier: string; why: string[]; impact: string; findings: unknown[]; modelFlag: boolean; previouslyAutomatic: boolean;
  route: string; refusingRule: boolean; hours: boolean; field: string; value: unknown; held: boolean; dest: string; amended: boolean;
  ruleOrHours: boolean; duplicateOf?: string; restatesProduction: boolean;
}
const rows: Row[] = wf.build();
const docs = path.join(__dirname, '..', '..', '..', 'docs', 'pilot');

const base = (over: Partial<Row> = {}): Row => ({
  id: 'x', tier: '', why: [], impact: 'low', findings: [], modelFlag: false, previouslyAutomatic: false, route: 'batch', refusingRule: false, hours: false,
  field: 'toilets.toilets', value: 'yes', held: false, dest: 'claim', amended: false, ruleOrHours: false, restatesProduction: false, ...over,
});

describe('every item has one tier, and the arithmetic adds up', () => {
  it('the tiers partition the items', () => {
    const tiers = ['expert', 'reviewer', 'grouped', 'parked', 'merged', 'deferred', 'rejected'];
    expect(rows.every((r) => tiers.includes(r.tier))).toBe(true);
    const summary = wf.summarise(rows);
    const removed = Object.values(summary.removedFromQueue as Record<string, number>).reduce((a, b) => a + b, 0);
    const tiered = Object.values(summary.tiers as Record<string, number>).reduce((a, b) => a + b, 0);
    expect(removed + tiered).toBe(rows.length);
  });

  it('the committed summary is what the code produces', () => {
    const committed = JSON.parse(fs.readFileSync(path.join(docs, 'review-workflow.json'), 'utf8'));
    expect(committed.summary).toEqual(JSON.parse(JSON.stringify(wf.summarise(rows))));
  });
});

describe('a person decides everything that could be published', () => {
  it('no item is published without a human tier: only parked, merged, deferred and rejected items skip one, and none of them publishes anything', () => {
    for (const r of rows.filter((x) => x.previouslyAutomatic)) {
      expect(['expert', 'reviewer', 'grouped', 'parked', 'merged', 'deferred'], r.id).toContain(r.tier);
    }
    expect(rows.filter((r) => r.previouslyAutomatic && ['expert', 'reviewer', 'grouped'].includes(r.tier)).length).toBeGreaterThan(0);
  });

  it('a model reading is a flag that moves an item up and never down or out', () => {
    expect(wf.classify(base({ impact: 'low', modelFlag: false })).tier).toBe('grouped');
    expect(wf.classify(base({ impact: 'low', modelFlag: true })).tier).toBe('reviewer');
    // Agreement is not a clearance: an item that needs an expert stays with an expert whatever two models said.
    expect(wf.classify(base({ field: 'pricing.free', modelFlag: false })).tier).toBe('expert');
    expect(wf.classify(base({ hours: true, modelFlag: false })).tier).toBe('expert');
    expect(wf.classify(base({ held: true })).tier).toBe('expert');
  });

  it('only a mechanical failure rejects, and the reason says so', () => {
    expect(wf.classify(base({ route: 'auto-reject' })).tier).toBe('rejected');
    expect(wf.classify(base({ modelFlag: true, route: 'individual' })).tier).not.toBe('rejected');
  });

  it('parking, merging and deferring are the only other exits, each because nothing would be published', () => {
    expect(wf.classify(base({ dest: 'NO HOME: stations, buses, fees and entrances have no claim type' })).tier).toBe('parked');
    expect(wf.classify(base({ duplicateOf: 'y' })).tier).toBe('merged');
    expect(wf.classify(base({ restatesProduction: true })).tier).toBe('deferred');
  });
});

describe('who decides what', () => {
  it('everything that can refuse a date or a household, contradict a provider or put a price in front of a parent goes to an expert', () => {
    for (const r of rows.filter((x) => ['expert', 'reviewer', 'grouped'].includes(x.tier))) {
      if (r.refusingRule || r.hours || /^pricing\./.test(r.field) || r.held) expect(r.tier, r.id).toBe('expert');
    }
  });

  it('a "no" on access is an expert decision; a "no" elsewhere is at least a reviewer decision', () => {
    expect(wf.classify(base({ field: 'access.wheelchair', value: 'no' })).tier).toBe('expert');
    expect(wf.classify(base({ field: 'transport.blueBadge', value: 'no' })).tier).toBe('expert');
    expect(wf.classify(base({ field: 'transport.parking', value: 'no' })).tier).toBe('reviewer');
  });

  it('a rule that only informs (an area closure, a caution) is not an expert decision', () => {
    expect(wf.classify(base({ ruleOrHours: true, refusingRule: false, hours: false, field: 'considerations.cascades', impact: 'high' })).tier).toBe('reviewer');
  });

  it('only low-impact, clean, unflagged items are grouped', () => {
    for (const r of rows.filter((x) => x.tier === 'grouped')) {
      expect(r.impact, r.id).toBe('low');
      expect(r.findings, r.id).toEqual([]);
      expect(r.modelFlag, r.id).toBe(false);
      expect(r.amended, r.id).toBe(false);
      expect(String(r.value), r.id).not.toBe('no');
    }
  });

  it('a group of three or fewer is read item by item, and a larger one has a sample of at least three', () => {
    const { groups, alone } = wf.groupsOf(rows);
    expect(alone.length + groups.reduce((n: number, g: { size: number }) => n + g.size, 0)).toBe(rows.filter((r) => r.tier === 'grouped').length);
    for (const g of groups) { expect(g.size).toBeGreaterThan(3); expect(g.sample.length).toBeGreaterThanOrEqual(3); }
  });
});

describe('the session kit measures a reviewer without contaminating the record', () => {
  const full = { summary: {}, batchGroups: [], queue: rows.filter((r) => ['expert', 'reviewer', 'grouped'].includes(r.tier)).map((r) => ({ ...(r as object), quote: 'q', proposed: `Toilets are available. ${r.id}`, url: 'https://example.org', impact: r.impact, findings: r.findings, reasons: [] })) };
  const { pack, manifest } = wf.sessionPack(rows, full, 'reviewer');

  it('plants hidden controls that look like any other card', () => {
    const controls = pack.queue.filter((q: { id: string }) => manifest.controls[q.id]);
    expect(controls.length).toBeGreaterThanOrEqual(1);
    for (const c of controls) {
      expect(c.findings).toEqual([]);
      expect(JSON.stringify(c)).not.toMatch(/planted|control|seeded/i);
    }
    expect(Object.keys(manifest.controls).every((id) => id.startsWith('ctl:'))).toBe(true);
    // The manifest is separate: the pack the reviewer opens does not contain it.
    expect(JSON.stringify(pack)).not.toContain('"controls"');
  });

  const ids = pack.queue.map((q: { id: string }) => q.id);
  const decide = (rule: (id: string) => string) => ids.map((id: string, i: number) => ({ n: i + 1, at: new Date(2026, 9, 9, 10, 0, i).toISOString(), reviewer: 't', itemId: id, decision: rule(id), secondsOnItem: 10 + i }));

  it('scores a careless session as having caught none, and keeps controls out of the audit trail', () => {
    const r = score(decide(() => 'approve'), manifest);
    expect(r.controls.caught).toBe(0);
    expect(r.controls.approved).toBe(r.controls.planted);
    expect(r.audit.some((e: { itemId?: string }) => String(e.itemId).startsWith('ctl:'))).toBe(false);
    expect(r.realDecisions).toBe(ids.length - r.controls.planted);
  });

  it('scores a careful session as having caught them all', () => {
    const r = score(decide((id) => (manifest.controls[id] ? 'reject' : 'approve')), manifest);
    expect(r.controls.caught).toBe(r.controls.planted);
    expect(r.measured.byTier.reviewer.decisions).toBeGreaterThan(0);
  });

  it('an undone control decision counts as not reached, and its undo never reaches the trail', () => {
    const lines = decide((id) => (manifest.controls[id] ? 'approve' : 'approve'));
    const target = lines.find((l: { itemId: string }) => manifest.controls[l.itemId]);
    const withUndo = [...lines, { n: lines.length + 1, at: new Date(2026, 9, 9, 11, 0, 0).toISOString(), reviewer: 't', decision: 'revert', targets: target.n }];
    const r = score(withUndo, manifest);
    expect(r.controls.notReached).toBe(1);
    expect(r.audit.every((e: { decision: string; targets?: number }) => e.decision !== 'revert' || e.targets !== undefined)).toBe(true);
  });
});

describe('the review page keeps the source in view and shows what a check cannot', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'pilot', 'review-pack.cjs'), 'utf8');
  it('shows the quote in its page context, the page link and the words that are not in the quote', () => {
    expect(html).toContain('Open the page');
    expect(html).toContain('Highlighted words are not in the quote');
    expect(html).toContain("class=\"ctx\"");
  });
  it('highlights a negation the quote does not carry and warns when the quote has one the proposal drops', () => {
    expect(html).toContain('const NEG=');
    expect(html).toContain('The quote contains a negation');
  });
  it('never labels anything accepted by the gate: every card needs a person', () => {
    expect(html).not.toContain("'accepted by the gate'");
  });
});
