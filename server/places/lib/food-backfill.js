const { keyFor } = require('./food-proximity');

/**
 * A one-off, bounded, restartable backfill of "food near this venue" for the venues FamilyPilot already stores.
 *
 * WHY. The food filters (café on site, food within 5 or 10 minutes' walk) can only answer for a venue whose
 * OpenStreetMap lookup has been stored, and the lookup happens only when a parent opens a venue page: 8 of 155
 * stored places in production. Without this, the filters would stay almost empty for a long time, and an empty
 * filter result is exactly what a parent would misread as "no food near any venue".
 *
 * THE RULES THIS ORCHESTRATOR ENFORCES (each one is tested, with a fake provider, in food-backfill.test.ts):
 *
 *   - Overpass is public infrastructure. Its published fair-use guidance treats under 10,000 queries and 1 GB a
 *     day as safe, and asks anything regular to divide that by 100. A one-off of ~150 small requests, run one at a
 *     time with a pause between each, is far inside it. It is NOT a cron, and it is not run twice: a second run
 *     skips every anchor that already has a stored row.
 *   - Anchors are de-duplicated on the same key the lookup caches under, so two venues at one address cost one
 *     request, and an anchor already stored (fresh or stale) is skipped, which is also what makes a stopped run
 *     restartable.
 *   - One request at a time, never fewer than MIN_DELAY_S between them, never more than `limit` in total.
 *   - The first provider error, rate-limit signal or retry/failover STOPS the run. A retry means the endpoint
 *     asked us to slow down; the right response is to stop and report, not to push on.
 *   - No Google, no paid provider, no other fallback: the only collaborator that can reach the network is the
 *     injected `lookup`, which in production is `getNearbyFood` (OpenStreetMap only).
 *   - Persistence is required. If the cache cannot be written the run refuses to start, because requests whose
 *     answers are thrown away are pure load on a donated service.
 *   - Every anchor is accounted for as attempted, succeeded, failed or skipped, with the reason.
 */

const MIN_DELAY_S = 8;
const DEFAULT_DELAY_S = 10;
const DEFAULT_LIMIT = 160;
const HARD_LIMIT = 200;

/** @typedef {{ id: string, name: string, latitude: number, longitude: number }} Anchor */

/** Distinct anchors, in a stable order, keyed exactly as the lookup caches them. */
function planAnchors(places) {
  const seen = new Map();
  for (const place of places) {
    if (!Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) continue;
    const key = keyFor(place);
    if (!seen.has(key)) seen.set(key, { key, id: place.id, name: place.name, latitude: place.latitude, longitude: place.longitude, alsoFor: [] });
    else seen.get(key).alsoFor.push(place.id);
  }
  return [...seen.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * @param {{ places: Anchor[] }} input
 * @param {{
 *   apply: boolean, limit?: number, delaySeconds?: number,
 *   lookup: (anchor: object) => Promise<{ cacheState: string, overpassRequests: number, overpassHttpRequests: number|null, totalFound: number, candidates: object[] }>,
 *   isStored: (key: string) => Promise<boolean>,
 *   canPersist: () => boolean,
 *   preflight?: () => Promise<{ ok: boolean, reason?: string }>,
 *   sleep: (ms: number) => Promise<void>,
 *   log?: (line: object) => void,
 * }} deps
 */
async function runFoodBackfill({ places }, deps) {
  const log = deps.log ?? (() => {});
  const limit = Math.min(Math.max(Math.floor(deps.limit ?? DEFAULT_LIMIT), 1), HARD_LIMIT);
  const delayMs = Math.max(deps.delaySeconds ?? DEFAULT_DELAY_S, MIN_DELAY_S) * 1000;
  const anchors = planAnchors(places);
  const ledger = { anchors: anchors.length, attempted: 0, succeeded: 0, failed: 0, skipped: 0, withFoodWithin10: 0, nothingMapped: 0, stoppedBecause: null, entries: [] };
  const note = (entry) => {
    ledger.entries.push(entry);
    log(entry);
  };

  if (!deps.apply) {
    // Plan only: nothing is read from the provider and nothing is written.
    for (const a of anchors) note({ anchor: a.id, name: a.name, outcome: 'planned' });
    ledger.stoppedBecause = 'plan only (no --apply)';
    return ledger;
  }
  if (!deps.canPersist()) {
    ledger.stoppedBecause = 'refused: results cannot be stored, so the requests would be wasted load';
    return ledger;
  }
  if (deps.preflight) {
    const gate = await deps.preflight();
    if (!gate.ok) {
      ledger.stoppedBecause = `provider not ready: ${gate.reason ?? 'status check failed'}`;
      return ledger;
    }
  }

  let first = true;
  for (const anchor of anchors) {
    if (await deps.isStored(anchor.key)) {
      ledger.skipped += 1;
      note({ anchor: anchor.id, name: anchor.name, outcome: 'skipped', reason: 'already stored' });
      continue;
    }
    if (ledger.attempted >= limit) {
      ledger.skipped += 1;
      note({ anchor: anchor.id, name: anchor.name, outcome: 'skipped', reason: `request cap of ${limit} reached` });
      continue;
    }
    if (!first) await deps.sleep(delayMs);
    first = false;
    ledger.attempted += 1;
    try {
      const result = await deps.lookup(anchor);
      const retried = Number(result.overpassHttpRequests ?? result.overpassRequests ?? 0) > 1;
      ledger.succeeded += 1;
      if (result.totalFound > 0) ledger.withFoodWithin10 += 1;
      else ledger.nothingMapped += 1;
      note({ anchor: anchor.id, name: anchor.name, outcome: 'succeeded', cacheState: result.cacheState, candidates: result.totalFound, httpRequests: result.overpassHttpRequests ?? null });
      if (retried) {
        ledger.stoppedBecause = 'stopped: the provider needed a retry or failover, which is a back-off signal';
        break;
      }
    } catch (error) {
      ledger.failed += 1;
      note({ anchor: anchor.id, name: anchor.name, outcome: 'failed', error: String(error?.message ?? error).slice(0, 160) });
      ledger.stoppedBecause = 'stopped on the first provider error';
      break;
    }
  }
  // Anything not reached because the run stopped is skipped, with the reason, so the ledger always balances.
  const seenIds = new Set(ledger.entries.map((e) => e.anchor));
  for (const anchor of anchors) {
    if (!seenIds.has(anchor.id)) {
      ledger.skipped += 1;
      note({ anchor: anchor.id, name: anchor.name, outcome: 'skipped', reason: ledger.stoppedBecause ?? 'not reached' });
    }
  }
  return ledger;
}

module.exports = { runFoodBackfill, planAnchors, MIN_DELAY_S, DEFAULT_DELAY_S, DEFAULT_LIMIT, HARD_LIMIT };
