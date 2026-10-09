import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { build, sqlFor } = require('../../scripts/pilot/publish-batch.cjs');

const NHM = 'ChIJPy8Y5kIFdkgRxGSXw4Xjt3s:opening.closure';
const DISCOVER = 'ChIJJ2CD1mEddkgRAuOi9iSzBrk:pushchair.restriction';
const AS_OF = '2026-10-09';

describe('a publishing batch for approved rules and hours', () => {
  it('refuses anything but a named person as approver', () => {
    for (const bad of ['', 'pilot-review:assumed', 'human:pilot-review-assumed', 'source_evidence_auto_v2', 'aidan', 'human:']) {
      expect(() => build({ items: [NHM], approver: bad, asOf: AS_OF })).toThrow(/named person/);
    }
    expect(build({ items: [NHM], approver: 'human:aidan', asOf: AS_OF }).length).toBeGreaterThan(0);
  });

  it('writes the rules an item justifies with their own source, quotation and reading date, valid 30 days', () => {
    const claims = build({ items: [NHM], approver: 'human:aidan', asOf: AS_OF });
    expect(claims.map((c: { fieldKey: string }) => c.fieldKey).sort()).toEqual(['rules.closed-2026-10-09', 'rules.closed-christmas']);
    for (const c of claims) {
      expect(c.evidence.url).toBe('https://www.nhm.ac.uk/visit.html');
      expect(c.evidence.quote).toMatch(/9 October/);
      expect(c.validUntil).toBe('2026-11-07');
    }
  });

  it('--warn-only removes the power to refuse a household and nothing else', () => {
    const refuse = build({ items: [DISCOVER], approver: 'human:aidan', asOf: AS_OF })[0];
    const warn = build({ items: [DISCOVER], approver: 'human:aidan', asOf: AS_OF, warnOnly: ['pushchair-play-areas'] })[0];
    expect(refuse.value.coversCoreVisit).toBe(true);
    expect(warn.value.coversCoreVisit).toBeUndefined();
    expect({ ...warn.value, coversCoreVisit: undefined }).toEqual({ ...refuse.value, coversCoreVisit: undefined });
  });

  it('refuses a reading older than its window, an unknown venue, and an item that is not a rule', () => {
    expect(() => build({ items: [NHM], approver: 'human:aidan', asOf: '2026-12-01' })).toThrow(/past its 30-day window/);
    expect(() => build({ items: ['ChIJnope:opening.closure'], approver: 'human:aidan', asOf: AS_OF })).toThrow(/no pilot venue/);
    expect(() => build({ items: ['ChIJPy8Y5kIFdkgRxGSXw4Xjt3s:toilets.toilets'], approver: 'human:aidan', asOf: AS_OF })).toThrow(/yields no rule/);
  });

  it('ids depend on the label, so a re-publication after a rollback does not collide with the withdrawn rows', () => {
    const a = build({ items: [NHM], approver: 'human:aidan', asOf: AS_OF, label: 'wave1' });
    const a2 = build({ items: [NHM], approver: 'human:aidan', asOf: AS_OF, label: 'wave1' });
    const b = build({ items: [NHM], approver: 'human:aidan', asOf: AS_OF, label: 'wave1-again' });
    expect(a.map((c: { id: string }) => c.id)).toEqual(a2.map((c: { id: string }) => c.id));
    expect(a[0].id).not.toBe(b[0].id);
  });

  it('the SQL aborts on a clash or a missing venue, and the rollback only ever disputes the batch\'s own rows', () => {
    const claims = build({ items: [NHM], approver: 'human:aidan', asOf: AS_OF });
    const { apply, rollback } = sqlFor(claims, 'human:aidan', 'wave1');
    expect(apply).toMatch(/raise exception 'Batch aborted: % venue\(s\) are not in place_records/);
    expect(apply).toMatch(/already have an active claim/);
    expect(apply).not.toMatch(/\bdelete\b/i);
    expect(rollback).toMatch(/set status = 'disputed'/);
    expect(rollback).not.toMatch(/\bdelete\b/i);
    for (const c of claims) expect(rollback).toContain(c.id);
  });
});
