/**
 * The review audit trail: append-only, tamper-evident, and every decision reversible.
 *
 * One JSON object per line. A decision is never edited or deleted. To change your mind you add a line:
 *   revert   withdraws an earlier entry (and a later revert withdraws the revert, so "undo the undo" works)
 *   any new decision on the same item simply supersedes the last live one
 * Each line carries the hash of the line before it, so removing, reordering or editing a past line is detectable (`verifyChain`).
 *
 * What a reviewer can do with an item:
 *   approve   the proposed meaning is right as written
 *   edit      the quote is right but the proposed meaning is not; the reviewer supplies the meaning (`editedText`, `editedValue`)
 *   reject    the evidence does not support it
 *   unknown   the page does not settle it; kept as an unknown, never shown as a fact
 *   batch     (kind: 'batch') one decision for a group of equivalent items, written as one line per item with the same `batchId`,
 *             so a batch can be reverted as a whole
 *
 * Nothing here publishes anything. A decision is an input to a separate, explicitly approved step.
 */
const crypto = require('node:crypto');

const DECISIONS = new Set(['approve', 'edit', 'reject', 'unknown', 'revert']);
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

/** A new entry chained to `previous` (the entry before it, or null for the first). */
function makeEntry(previous, fields) {
  if (!DECISIONS.has(fields.decision)) throw new Error(`unknown decision "${fields.decision}"`);
  if (!fields.reviewer) throw new Error('a decision needs a reviewer');
  if (fields.decision === 'revert' && !fields.targets) throw new Error('a revert needs the entry it withdraws (`targets`)');
  if (fields.decision !== 'revert' && !fields.itemId) throw new Error('a decision needs the item it is about (`itemId`)');
  if (fields.decision === 'edit' && !(fields.editedText || fields.editedValue !== undefined)) throw new Error('an edit needs the corrected meaning');
  const body = {
    seq: previous ? previous.seq + 1 : 1,
    at: fields.at ?? new Date().toISOString(),
    decision: fields.decision, reviewer: fields.reviewer,
    ...(fields.itemId ? { itemId: fields.itemId } : {}),
    ...(fields.targets ? { targets: fields.targets } : {}),
    ...(fields.editedText ? { editedText: fields.editedText } : {}),
    ...(fields.editedValue !== undefined ? { editedValue: fields.editedValue } : {}),
    ...(fields.note ? { note: fields.note } : {}),
    ...(fields.batchId ? { batchId: fields.batchId } : {}),
    ...(typeof fields.secondsOnItem === 'number' ? { secondsOnItem: fields.secondsOnItem } : {}),
    prev: previous ? previous.hash : null,
  };
  return { ...body, hash: sha(JSON.stringify(body)) };
}

/** True when every line's hash matches its content and its `prev` is the line before it. Returns the first bad line otherwise. */
function verifyChain(entries) {
  let previous = null;
  for (const entry of entries) {
    const { hash, ...body } = entry;
    if (sha(JSON.stringify(body)) !== hash) return { ok: false, at: entry.seq, why: 'content does not match its hash' };
    if ((entry.prev ?? null) !== (previous ? previous.hash : null)) return { ok: false, at: entry.seq, why: 'does not follow the line before it' };
    if (entry.seq !== (previous ? previous.seq + 1 : 1)) return { ok: false, at: entry.seq, why: 'out of sequence' };
    previous = entry;
  }
  return { ok: true };
}

/** The entries still in force: those no live revert withdraws. A revert is itself withdrawn by a later live revert. */
function liveEntries(entries) {
  const live = new Map(entries.map((e) => [e.seq, true]));
  // Later entries are decided first: a revert only counts if it is itself live.
  for (const entry of [...entries].sort((a, b) => b.seq - a.seq)) {
    if (entry.decision === 'revert' && live.get(entry.seq)) live.set(entry.targets, false);
  }
  return entries.filter((e) => live.get(e.seq));
}

/** Each item's current decision: the latest live decision about it; an item with none is undecided. */
function currentState(entries) {
  const state = new Map();
  for (const entry of liveEntries(entries)) {
    if (entry.decision === 'revert') continue;
    state.set(entry.itemId, entry);
  }
  return state;
}

/** The effective meaning of an item after review: edited text wins over the proposal; reject and unknown remove it as a fact. */
function effective(item, decision) {
  if (!decision) return { status: 'undecided', text: item.proposed, value: item.value };
  switch (decision.decision) {
    case 'approve': return { status: 'approved', text: item.proposed, value: item.value };
    case 'edit': return { status: 'approved-as-edited', text: decision.editedText ?? item.proposed, value: decision.editedValue !== undefined ? decision.editedValue : item.value };
    case 'reject': return { status: 'rejected', text: null, value: null };
    case 'unknown': return { status: 'unknown', text: null, value: null };
    default: return { status: 'undecided', text: item.proposed, value: item.value };
  }
}

/** A batch decision as one entry per item, sharing a batchId so it can be withdrawn together. */
function batchDecision(previous, itemIds, fields) {
  const batchId = fields.batchId ?? `batch-${sha(itemIds.join('|') + (fields.at ?? ''))}`;
  const out = [];
  let prev = previous;
  for (const itemId of itemIds) {
    const entry = makeEntry(prev, { ...fields, itemId, batchId });
    out.push(entry);
    prev = entry;
  }
  return out;
}

/** Withdraw every live entry of a batch. */
function revertBatch(previous, entries, batchId, reviewer, at) {
  const out = [];
  let prev = previous;
  for (const target of liveEntries(entries).filter((e) => e.batchId === batchId && e.decision !== 'revert')) {
    const entry = makeEntry(prev, { decision: 'revert', reviewer, targets: target.seq, at, note: `withdrawn with ${batchId}` });
    out.push(entry);
    prev = entry;
  }
  return out;
}

module.exports = { makeEntry, verifyChain, liveEntries, currentState, effective, batchDecision, revertBatch, sha };
