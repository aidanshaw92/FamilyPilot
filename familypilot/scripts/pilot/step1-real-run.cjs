// Usage: REPO=<checkout of main> DATA=<dir with ids.txt, claims.txt, fulltext.json> node step1-real-run.cjs
// ids.txt: "id|name" per line. claims.txt: "venue|field|value|url|checked|valid_until|claim_id|excerpt". fulltext.json: the newest stored row per page
// (vid,url,type,at,fs,scope,reason,title,text), exported read-only from venue_source_evidence. The page text is not committed.
// Runs the REAL verifiedBundleForVenue, reconcileSourceClaims and reviewEvidence from main against the stored pages and
// the active claims, with only the database reads/writes replaced by in-memory recorders. Nothing leaves the process.
const path = require('node:path'); const fs = require('node:fs');
const REPO = process.env.REPO; const L = (p) => path.join(REPO, 'server/enrichment/_lib', p);
const S = process.env.DATA || __dirname;
const FULL = JSON.parse(fs.readFileSync(path.join(S, 'fulltext.json'), 'utf8'));
const IDS = fs.readFileSync(path.join(S, 'ids.txt'), 'utf8').trim().split('\n').map((l) => l.split('|'));
const claims = fs.readFileSync(path.join(S, 'claims.txt'), 'utf8').trim().split('\n').map((l) => { const [v, f, val, url, chk, vu, id, ...ex] = l.split('|'); return { familypilotPlaceId: v, fieldKey: f, valueJson: val, sourceUrl: url, checkedAt: chk, validUntil: vu, id, evidenceExcerpt: ex.join('|'), approvedBy: 'source_evidence_auto_v2', status: 'active' }; });
// Network guard: any attempt to open a socket or fetch fails the run loudly.
const net = require('node:net'); let attempts = 0; const origConnect = net.Socket.prototype.connect; net.Socket.prototype.connect = function () { attempts++; throw new Error('NETWORK ATTEMPT'); };
global.fetch = () => { attempts++; throw new Error('NETWORK ATTEMPT'); };
const evidenceStore = require(L('evidence-store'));
evidenceStore.listEvidenceForVenue = async (id) => FULL.filter((r) => r.vid === id).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).map((r) => ({ sourceUrl: r.url, sourceType: r.type, retrievedAt: r.at, fetchStatus: r.fs, extractedText: r.text, pageTitle: r.title, subjectScope: r.scope, subjectScopeReason: r.reason }));
const claimsStore = require(L('claims-store')); const disputed = [];
claimsStore.listClaimsForVenue = async (id) => claims.filter((c) => c.familypilotPlaceId === id && !disputed.includes(c.id));
claimsStore.disputeClaim = async (id) => { disputed.push(id); };
claimsStore.venueHasActiveClaims = async () => true;
const es = require(L('enrichment-store')); es.getMetadata = async () => ({ lastChecked: '2026-10-08', checkedBy: 'x' }); let rebuilds = 0; es.saveMetadata = async () => { rebuilds++; };
const te = require(L('trusted-evidence')); const aa = require(L('auto-approve'));
(async () => {
  const out = { added: [], corrected: [], withdrawn: [], requoted: [], unchanged: [], perVenue: {} };
  for (const [id, name] of IDS) {
    const bundle = await te.verifiedBundleForVenue(id);
    const before = disputed.length;
    await aa.reconcileSourceClaims(id, bundle);
    const wd = disputed.slice(before);
    const review = te.reviewEvidence(bundle, { excludeRescoped: true });
    const active = claims.filter((c) => c.familypilotPlaceId === id);
    const flat = {}; for (const [k, v] of Object.entries(review.payload)) { if (v && typeof v === 'object') for (const [k2, v2] of Object.entries(v)) flat[`${k}.${k2}`] = v2; else flat[k] = v; }
    for (const [key, value] of Object.entries(flat)) {
      const ev = key.includes('.') ? review.draft[key.split('.')[0]][key.split('.')[1]] : review.draft[key];
      const cur = active.find((c) => c.fieldKey === key);
      const next = { venue: name, id, key, value, src: ev.sourceUrl, quote: ev.evidence, checkedAt: String(ev.retrievedAt).slice(0, 10), validUntil: te.expiryDate(key, ev.retrievedAt) };
      if (!cur) out.added.push(next);
      else if (wd.includes(cur.id)) out.corrected.push({ ...next, replaces: cur.id, was: cur.valueJson });
      else if (cur.valueJson !== value) out.corrected.push({ ...next, replaces: cur.id, was: cur.valueJson });
      else {
        const same = cur.sourceUrl === next.src && (cur.evidenceExcerpt ?? '') === (next.quote ?? '') && cur.checkedAt === next.checkedAt && cur.validUntil === next.validUntil;
        (same ? out.unchanged : out.requoted).push({ ...next, old: cur.evidenceExcerpt, oldSrc: cur.sourceUrl, id: cur.id });
      }
    }
    for (const cid of wd) { const c = claims.find((x) => x.id === cid); const replaced = out.corrected.some((x) => x.replaces === cid); out.withdrawn.push({ venue: name, key: c.fieldKey, value: c.valueJson, claim: cid, replacedByCorrection: replaced, quote: c.evidenceExcerpt, src: c.sourceUrl }); }
    // Active claims the run does not touch at all (field not re-published and not withdrawn)
    out.perVenue[name] = { pagesUsed: bundle.sources.length, eligibleFields: review.fieldCount, withdrawn: wd.length };
  }
  const touched = new Set([...out.unchanged.map((x) => x.id), ...out.requoted.map((x) => x.id), ...out.withdrawn.map((x) => x.claim)]);
  out.untouched = claims.filter((c) => !touched.has(c.id)).length;
  out.networkAttempts = attempts; out.metadataRebuilds = rebuilds;
  fs.writeFileSync(path.join(process.env.OUT || S, 'real-run.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ added: out.added.length, corrected: out.corrected.length, withdrawnIncludingCorrected: out.withdrawn.length, pureWithdrawn: out.withdrawn.filter((w) => !w.replacedByCorrection).length, requoted: out.requoted.length, sameRowUnchanged: out.unchanged.length, activeNotInRunOutput: out.untouched, networkAttempts: attempts }));
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
