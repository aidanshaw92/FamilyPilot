import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const { makeEntry, verifyChain, liveEntries, currentState, effective, batchDecision, revertBatch } = require('../../scripts/pilot/review-audit.cjs');
const { runChecks, worst, venueIndex, numbersOf } = require('../../scripts/pilot/review-checks.cjs');

/**
 * The review process is a control, so it is tested like one: the audit trail cannot be quietly changed and every decision can be
 * undone; the independent checks catch the errors a verbatim match cannot see; and no item the gate accepted fails them.
 */

const T = '2026-10-08T10:00:00.000Z';
const entry = (prev: unknown, f: Record<string, unknown>) => makeEntry(prev, { reviewer: 'human:alice', at: T, ...f });

describe('the audit trail', () => {
  it('chains every line to the one before and notices an edited, removed or reordered line', () => {
    const a = entry(null, { itemId: 'x', decision: 'approve' });
    const b = entry(a, { itemId: 'y', decision: 'reject' });
    const c = entry(b, { itemId: 'z', decision: 'unknown' });
    expect(verifyChain([a, b, c]).ok).toBe(true);
    expect(verifyChain([a, { ...b, decision: 'approve' }, c]).ok).toBe(false); // edited
    expect(verifyChain([a, c]).ok).toBe(false); // removed
    expect(verifyChain([b, a, c]).ok).toBe(false); // reordered
  });

  it('lets a decision be withdrawn, and the withdrawal withdrawn', () => {
    const a = entry(null, { itemId: 'x', decision: 'approve' });
    const r1 = entry(a, { decision: 'revert', targets: a.seq });
    expect(currentState([a, r1]).has('x')).toBe(false);
    const r2 = entry(r1, { decision: 'revert', targets: r1.seq });
    expect(currentState([a, r1, r2]).get('x')?.decision).toBe('approve');
  });

  it('a later decision supersedes an earlier one without deleting it', () => {
    const a = entry(null, { itemId: 'x', decision: 'approve' });
    const b = entry(a, { itemId: 'x', decision: 'reject' });
    expect(currentState([a, b]).get('x')?.decision).toBe('reject');
    expect(liveEntries([a, b])).toHaveLength(2);
  });

  it('a batch is one decision per item and is withdrawn as a whole', () => {
    const first = entry(null, { itemId: 'seed', decision: 'approve' });
    const batch = batchDecision(first, ['a', 'b', 'c'], { decision: 'approve', reviewer: 'human:alice', at: T, batchId: 'g1' });
    const all = [first, ...batch];
    expect(currentState(all).size).toBe(4);
    const undo = revertBatch(all[all.length - 1], all, 'g1', 'human:alice', T);
    const after = [...all, ...undo];
    expect(verifyChain(after).ok).toBe(true);
    expect([...currentState(after).keys()]).toEqual(['seed']);
  });

  it('requires a reviewer, an item, and a meaning for an edit', () => {
    expect(() => makeEntry(null, { decision: 'approve', itemId: 'x' })).toThrow(/reviewer/);
    expect(() => entry(null, { decision: 'approve' })).toThrow(/item/);
    expect(() => entry(null, { itemId: 'x', decision: 'edit' })).toThrow(/corrected meaning/);
  });

  it('an edit changes the meaning, a reject or unknown removes it as a fact', () => {
    const item = { proposed: 'Toilets on every floor.', value: 'yes' };
    const edit = entry(null, { itemId: 'x', decision: 'edit', editedText: 'Toilets on the ground floor.' });
    expect(effective(item, edit)).toMatchObject({ status: 'approved-as-edited', text: 'Toilets on the ground floor.' });
    expect(effective(item, entry(edit, { itemId: 'x', decision: 'reject' }))).toMatchObject({ status: 'rejected', text: null });
    expect(effective(item, undefined)).toMatchObject({ status: 'undecided' });
  });
});

const venue = { slug: 'london-zoo', site: 'londonzoo.org' };
const fact = (over: Record<string, unknown> = {}) => ({
  sec: 'toilets', key: 'babyChanging', value: 'yes', status: 'review', text: 'Baby changing in the main toilets.',
  evidence: { url: 'https://www.londonzoo.org/visit', quote: 'Baby changing facilities are available in the main toilets.', readAt: '2026-10-08' }, ...over,
});
const levels = (f: unknown) => Object.fromEntries(runChecks(f, venue).map((c: { id: string; level: string }) => [c.id, c.level]));

describe('the independent checks', () => {
  it('pass a proposal its own evidence supports', () => {
    expect(worst(runChecks(fact(), venue))).toBe('pass');
  });
  it('fail a figure the quote does not contain, whatever the notation', () => {
    expect(levels(fact({ text: 'Baby changing in the main toilets; open until 6pm.' }))['numbers-supported']).toBe('fail');
    expect([...numbersOf('Open 10:00 a.m. - 5:30 p.m.')].sort()).toEqual(['t10:00', 't17:30']);
    expect(levels(fact({ text: 'Open 10am to 5.30pm', evidence: { url: 'https://www.londonzoo.org/x', quote: 'Open daily 10:00 a.m. - 5:30 p.m.', readAt: '2026-10-08' }, sec: 'opening', key: 'hours' }))['numbers-supported']).toBe('pass');
  });
  it('fail a number word the quote does not say', () => {
    expect(levels(fact({ text: 'Seven baby changing rooms.' }))['numbers-supported']).toBe('fail');
  });
  it('fail a quote that is not about the fact', () => {
    expect(levels(fact({ evidence: { url: 'https://www.londonzoo.org/p', quote: 'Parking is available on site.', readAt: '2026-10-08' } }))['mentions-subject']).toBe('fail');
  });
  it('fail a page that is not on the venue\'s own site', () => {
    expect(levels(fact({ evidence: { url: 'https://www.example.com/zoo', quote: 'Baby changing facilities are available.', readAt: '2026-10-08' } }))['own-site']).toBe('fail');
  });
  it('fail a "no" the quote does not say, and warn a "yes" the quote negates', () => {
    expect(levels(fact({ value: 'no', text: 'No baby changing.' }))['polarity']).toBe('fail');
    expect(levels(fact({ evidence: { url: 'https://www.londonzoo.org/p', quote: 'There is no baby changing in the east wing.', readAt: '2026-10-08' } }))['polarity']).toBe('warn');
  });
  it('warn when the quote names another site, a past year, or the proposal says more than the quote', () => {
    expect(levels(fact({ evidence: { url: 'https://www.londonzoo.org/p', quote: 'Baby changing facilities at Whipsnade are available.', readAt: '2026-10-08' } }))['this-place']).toBe('warn');
    expect(levels(fact({ evidence: { url: 'https://www.londonzoo.org/p', quote: 'Baby changing facilities are available until July 2025.', readAt: '2026-10-08' } }))['dated']).toBe('warn');
    expect(levels(fact({ text: 'Free baby changing throughout.' }))['no-over-reach']).toBe('warn');
  });
});

describe('the pilot profiles against the checks', () => {
  const idx = venueIndex();
  const dir = path.join(__dirname, '..', '..', '..', 'docs', 'pilot', 'profiles');
  const items = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).flatMap((f) => {
    const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    return p.facts.filter((x: { status: string }) => x.status === 'verified' || x.status === 'review').map((x: unknown) => ({ p, x, v: idx.get(p.id) }));
  });

  it('no item has a figure, subject or site its own evidence does not support', () => {
    const failing = items.filter(({ x, v }: { x: unknown; v: unknown }) => worst(runChecks(x, v)) === 'fail').map(({ p, x }: { p: { name: string }; x: { sec: string; key: string } }) => `${p.name} ${x.sec}.${x.key}`);
    expect(failing).toEqual([]);
  });

  it('nothing is accepted without a person unless every check passes', () => {
    const accepted = items.filter(({ x }: { x: { status: string } }) => x.status === 'verified');
    expect(accepted.length).toBeGreaterThan(40);
    const doubted = accepted.filter(({ x, v }: { x: unknown; v: unknown }) => worst(runChecks(x, v)) !== 'pass').map(({ p, x }: { p: { name: string }; x: { sec: string; key: string } }) => `${p.name} ${x.sec}.${x.key}`);
    expect(doubted).toEqual([]);
  });
});

describe('seeded errors', () => {
  it('the checks notice the structural ones and the held-out limit is recorded, not hidden', () => {
    const seeded = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'docs', 'pilot', 'review-seeded.json'), 'utf8'));
    const t = seeded.errorTypes;
    for (const name of ['the quote is about a different facility', 'the quote is from a different venue\'s site', 'an invented count (digits)']) expect(t[name].noticedPct, name).toBeGreaterThanOrEqual(95);
    for (const name of ['a figure changed (price, time or age)', 'a yes became a no', 'the proposal is about something else']) expect(t[name].noticedPct, name).toBeGreaterThanOrEqual(85);
    // The honest limit: an interpretation that adds a claim in words nobody listed is NOT caught. A person must be the control for it.
    expect(t['the proposal adds a claim in words the checks do not list'].noticedPct).toBeLessThan(25);
    expect(seeded.realFlagged.fail).toBe(0);
  });
});
