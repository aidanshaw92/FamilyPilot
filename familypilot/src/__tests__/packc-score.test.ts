import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const req = createRequire(import.meta.url);
const { run } = req('../../scripts/pilot/packc-score.cjs');
const key = req('../../../docs/pilot/beta/decisions/packC-scoring-key.json');

/** Pack C: the reviewer sees opaque ids; scoring puts the real ids back and never lets a planted control into the audit trail. */
const opaque = Object.keys(key.idMap) as string[];
const controlOpaque = opaque.filter((o) => key.controls[key.idMap[o]]);
const realOpaque = opaque.filter((o) => !key.controls[key.idMap[o]]);
const entry = (n: number, itemId: string, decision: string, reviewer = 'Jo Reviewer') => ({ n, at: `2026-10-10T10:${String(n).padStart(2, '0')}:00.000Z`, reviewer, itemId, decision, secondsOnItem: 30 });

describe('Pack C scoring', () => {
  it('has 13 cards, 4 of them planted controls, and opaque ids that reveal nothing', () => {
    expect(opaque).toHaveLength(13);
    expect(controlOpaque).toHaveLength(4);
    expect(opaque.every((o) => /^k[0-9a-f]{8}$/.test(o))).toBe(true);
  });

  it('a reviewer who rejects or marks unknown every control meets the bar, and only real decisions reach the audit trail', () => {
    const raw = [...realOpaque.map((o, i) => entry(i + 1, o, 'approve')), ...controlOpaque.map((o, i) => entry(20 + i, o, i % 2 ? 'reject' : 'unknown'))];
    const { audit, report } = run(raw, key);
    expect(report.controls).toMatchObject({ planted: 4, caught: 4, approved: 0 });
    expect(report.controlsBarMet).toBe(true);
    expect(audit).toHaveLength(9);
    expect(audit.every((e: { itemId: string }) => !e.itemId.startsWith('ctl:'))).toBe(true);
  });

  it('a reviewer who approves most controls does not meet the bar', () => {
    const raw = [...realOpaque.map((o, i) => entry(i + 1, o, 'approve')), ...controlOpaque.map((o, i) => entry(20 + i, o, i === 0 ? 'reject' : 'approve'))];
    expect(run(raw, key).report.controlsBarMet).toBe(false);
  });

  it('an export from an unknown card, or with no reviewer name, is refused', () => {
    expect(() => run([entry(1, 'knotacard', 'approve')], key)).toThrow(/not in the scoring key/);
    expect(() => run([entry(1, realOpaque[0], 'approve', 'unnamed')], key)).toThrow(/reviewer name/);
  });
});
