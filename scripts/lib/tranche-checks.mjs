/**
 * Checks a tranche of independent-identity entries must pass before a person is asked to sign it. Pure functions; no network, no provider, no database.
 *
 * Each entry is checked against the open source it names, not against anything else we hold:
 *   fidelity     the name, position, category and website are the source record's own (OS Open Greenspace or Wikidata)
 *   independence nothing Google-derived is in the entry: no Google marker, no stored Google id, no position that equals a stored Google value to its stored
 *                precision unless the source gives the same figures
 *   hygiene      one entry per source record, no two entries for one place, inside the app's scope, no private-use or generic name, an https website
 * An entry that fails any check is listed with the reason and is not proposed.
 */
import { createRequire } from 'node:module';

import { PRIVATE_USE_NAME, GENERIC_NAME, haversineKm, inScope, osParks, wikidataCandidates } from './open-licence.mjs';

const require = createRequire(import.meta.url);
const identities = require('../../server/places/lib/independent-identities.js');

/** Anything that names Google or carries a Google place id. Stored ids start `ChIJ` (or `fp-google-`); a source URL never should. */
export const GOOGLE_MARKER = /google|ChIJ[\w-]{10,}|places\/ChI|maps\.app\.goo|goo\.gl/i;

const decimals = (n) => { const s = String(n); const i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; };
const metres = (aLat, aLng, bLat, bLng) => haversineKm(aLat, aLng, bLat, bLng) * 1000;

/** Source records by their identifier, built from the same raw extracts the selector used. */
export function sourceIndex({ greenspace, wikidata }) {
  const os = new Map(osParks(greenspace).map((p) => [p.osId, p]));
  const wd = new Map(wikidataCandidates(wikidata).map((c) => [c.q.toUpperCase(), c]));
  return { os, wd };
}

/** Fidelity: the entry is exactly what its source says. Returns a list of problems (empty when it is). */
export function fidelityProblems(entry, index) {
  const out = [];
  const src = entry.identity?.source;
  if (src === 'os-greenspace') {
    const c = index.os.get(String(entry.identity.externalId).toLowerCase());
    if (!c) return ['not found in the OS Open Greenspace extract'];
    if (c.name !== entry.name) out.push(`name differs from the source ("${c.name}")`);
    if (metres(entry.location.latitude, entry.location.longitude, c.lat, c.lng) > 0.5) out.push('position is not the source\'s own interior point');
    if (c.category !== entry.category) out.push(`category differs from the source (${c.category})`);
    if (entry.website) out.push('an OS park carries no website of the source');
  } else if (src === 'wikidata') {
    const c = index.wd.get(String(entry.identity.externalId).toUpperCase());
    if (!c) return ['not found in the Wikidata extract'];
    if (c.hold) out.push(`the source class is held (${c.hold})`);
    if (c.name !== entry.name) out.push(`name differs from the source ("${c.name}")`);
    if (metres(entry.location.latitude, entry.location.longitude, c.lat, c.lng) > 0.5) out.push('position is not the source\'s own coordinate');
    if (c.category !== entry.category) out.push(`category differs from the source (${c.category})`);
    if (entry.website && !(c.website && c.website.replace(/^http:/i, 'https:') === entry.website)) out.push('website is not the one Wikidata lists');
  } else {
    out.push(`source ${src} is not one this check knows`);
  }
  return out;
}

/** Independence: no Google value reached the entry. `stored` is optional (private rows); without it only the marker check runs. */
export function independenceProblems(entry, stored = []) {
  const out = [];
  const text = JSON.stringify(entry);
  if (GOOGLE_MARKER.test(text)) out.push('a Google marker appears in the entry');
  for (const r of stored) {
    if (r.id && text.includes(String(r.id).replace(/^fp-google-/, ''))) { out.push('a stored Google place id appears in the entry'); break; }
  }
  const { latitude, longitude } = entry.location ?? {};
  const low = decimals(latitude) <= 4 && decimals(longitude) <= 4;
  if (low) {
    // A position given to four places or fewer is the precision of the stored Google rows. Equal to one of them, it looks copied unless the source says so.
    const same = stored.find((r) => Number(r.lat) === latitude && Number(r.lng) === longitude);
    if (same) out.push('position equals a stored Google row\'s to the same precision');
  }
  return out;
}

/** Hygiene: things a reviewer should not have to find by eye. */
export function hygieneProblems(entry) {
  const out = [];
  const { latitude, longitude } = entry.location ?? {};
  if (!inScope(latitude, longitude)) out.push('outside the 40 km scope');
  if (PRIVATE_USE_NAME.test(entry.name)) out.push('the name says a club, school, cemetery or similar');
  if (GENERIC_NAME.test(entry.name.trim())) out.push('the name is generic ("park", "gardens")');
  if (entry.website) {
    let u; try { u = new URL(entry.website); } catch { out.push('website is not a URL'); return out; }
    if (u.protocol !== 'https:') out.push('website is not https');
    if (/google\./i.test(u.hostname)) out.push('website points at Google');
  }
  return out;
}

/** Batch-level: one entry per source record, and no two entries for one place. Returns problems keyed by familypilotId. */
export function batchProblems(entries, { sameNameWithinM = 150 } = {}) {
  const out = new Map();
  const add = (id, p) => out.set(id, [...(out.get(id) ?? []), p]);
  const seenId = new Map(); const seenSrc = new Map();
  for (const e of entries) {
    if (seenId.has(e.familypilotId)) add(e.familypilotId, 'duplicate entry id');
    seenId.set(e.familypilotId, true);
    const key = `${e.identity?.source}:${String(e.identity?.externalId).toLowerCase()}`;
    if (seenSrc.has(key)) add(e.familypilotId, `same source record as ${seenSrc.get(key)}`);
    seenSrc.set(key, e.familypilotId);
  }
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i]; const b = entries[j];
      if (a.name.toLowerCase() !== b.name.toLowerCase()) continue;
      if (metres(a.location.latitude, a.location.longitude, b.location.latitude, b.location.longitude) <= sameNameWithinM) add(b.familypilotId, `same name within ${sameNameWithinM} m of ${a.familypilotId}`);
    }
  }
  return out;
}

/**
 * Everything, for a whole tranche. `shape` runs the registry's own validator as if signed, so a failure here is a failure the loader would refuse.
 * `allow` maps an entry id to the reason a person accepted its failing rule(s): such an entry is reported as accepted, with the rule and the reason, not hidden.
 */
export function validateTranche(entries, { index, stored = [], allow = {} }) {
  const batch = batchProblems(entries);
  const rows = entries.map((entry) => {
    const probs = [];
    const bad = identities.problemWith({ ...entry, reviewedBy: 'counted for validation only' }, {});
    if (bad) probs.push(`registry: ${bad}`);
    probs.push(...fidelityProblems(entry, index).map((p) => `source: ${p}`));
    probs.push(...independenceProblems(entry, stored).map((p) => `independence: ${p}`));
    probs.push(...hygieneProblems(entry).map((p) => `hygiene: ${p}`));
    probs.push(...(batch.get(entry.familypilotId) ?? []).map((p) => `batch: ${p}`));
    const accepted = probs.length && allow[entry.familypilotId] ? allow[entry.familypilotId] : null;
    // Registry, source and independence failures are never acceptable; only hygiene and batch rules can be overruled by a person.
    const hard = probs.filter((p) => /^(registry|source|independence):/.test(p));
    return { id: entry.familypilotId, name: entry.name, category: entry.category, source: entry.identity?.source, problems: probs, accepted: accepted && !hard.length ? accepted : null };
  });
  const failed = rows.filter((r) => r.problems.length && !r.accepted);
  const acceptedRows = rows.filter((r) => r.problems.length && r.accepted);
  return { total: entries.length, passed: entries.length - failed.length, failed, accepted: acceptedRows, rows };
}
