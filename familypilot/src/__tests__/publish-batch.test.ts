import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { build, sqlFor, fromDecisions } = require('../../scripts/pilot/publish-batch.cjs');
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
    expect(() => build({ items: ['ChIJV_iXMtcadkgRqBI84CY_crE:pricing.variable'], approver: 'human:aidan', asOf: AS_OF })).toThrow(/yields no rule, hours reading or publishable fact/);
    expect(() => build({ items: ['ChIJp8y37pgCdkgRBeRSa2iabyI:play.playground'], approver: 'human:aidan', asOf: AS_OF })).toThrow(/yields no rule/); // 'adjacent' is not a claim
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

  it('a plain facility fact becomes one claim with the venue-stated value, valid 30 days', () => {
    const [parking] = build({ items: ['ChIJSzwgydoDdkgRndnXVYQGXBI:transport.parking'], approver: 'human:aidan', asOf: AS_OF });
    expect(parking.fieldKey).toBe('familyFacilities.parking');
    expect(parking.value).toBe('no');
    const [toilets] = build({ items: ['ChIJJ2CD1mEddkgRAuOi9iSzBrk:toilets.toilets'], approver: 'human:aidan', asOf: AS_OF });
    expect([toilets.fieldKey, toilets.value]).toEqual(['familyFacilities.toilets', 'yes']);
    expect(toilets.validUntil).toBe('2026-11-07');
  });

  describe('from a decisions file', () => {
    const write = (lines: object[]) => {
      const f = join(mkdtempSync(join(tmpdir(), 'dec-')), 'd.jsonl');
      writeFileSync(f, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
      return f;
    };
    const DIS = 'ChIJJ2CD1mEddkgRAuOi9iSzBrk';
    const GUN = 'ChIJrcFVE-YNdkgRJQPxAxaTnMY:opening.hours';

    it('publishes only approved and edited items; unknown and reject never publish; prices ship as code', () => {
      const f = write([
        { n: 1, itemId: `${DIS}:pushchair.restriction`, decision: 'edit', editedText: 'Edited wording.' },
        { n: 2, itemId: `${DIS}:pushchair.twins`, decision: 'unknown' },
        { n: 3, itemId: `${DIS}:pricing.paid`, decision: 'approve' },
        { n: 4, itemId: NHM, decision: 'reject' },
      ]);
      const d = fromDecisions(f);
      expect(d.items).toEqual([`${DIS}:pushchair.restriction`]);
      expect(d.skipped.join('|')).toMatch(/pushchair\.twins \(unknown: not published\)/);
      expect(d.skipped.join('|')).toMatch(/pricing\.paid \(ships as reviewed data/);
      expect(d.skipped.join('|')).toMatch(/opening\.closure \(reject: not published\)/);
    });

    it('a revert withdraws the decision it targets, so the item is no longer published', () => {
      const f = write([
        { n: 1, itemId: NHM, decision: 'approve' },
        { n: 2, decision: 'revert', targets: 1 },
      ]);
      expect(fromDecisions(f).items).toEqual([]);
    });

    it("an edit replaces the wording of a rule that IS the reviewed sentence, and only that rule", () => {
      const edited = build({ items: [`${DIS}:pushchair.restriction`], approver: 'human:aidan', asOf: AS_OF, textEdits: { [`${DIS}:pushchair.restriction`]: 'Edited wording.' } });
      expect(edited[0].value.text).toBe('Edited wording.');
      // NHM's closure rules carry their own fixed text, so an edit to the item does not overwrite them.
      const nhm = build({ items: [NHM], approver: 'human:aidan', asOf: AS_OF, textEdits: { [NHM]: 'Should not apply.' } });
      expect(nhm.every((c: { value: { text: string } }) => c.value.text !== 'Should not apply.')).toBe(true);
    });

    it('a dropped rule is not written, but the hours reading from the same item still is', () => {
      const all = build({ items: [GUN], approver: 'human:aidan', asOf: AS_OF });
      expect(all.map((c: { fieldKey: string }) => c.fieldKey)).toContain('rules.museum-closed-mondays');
      const dropped = build({ items: [GUN], approver: 'human:aidan', asOf: AS_OF, dropRules: ['museum-closed-mondays'] });
      const keys = dropped.map((c: { fieldKey: string }) => c.fieldKey);
      expect(keys).not.toContain('rules.museum-closed-mondays');
      expect(keys).toEqual(expect.arrayContaining(['hours.park', 'hours.museum']));
    });
  });
});
