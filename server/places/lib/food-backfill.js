const { keyFor } = require('./food-proximity');
const { elementToCandidate, dedupeCandidates, DEFAULT_RADIUS_M, MAX_ELEMENTS } = require('./osm-food');
const { estimateWalkMinutes } = require('./nearby-food');

/**
 * A one-off, bounded, restartable backfill of "food near this venue" for the venues FamilyPilot already stores,
 * in the SMALLEST number of Overpass requests that is still responsible.
 *
 * WHY. The food filters (café on site, food within 5 or 10 minutes' walk) can only answer for a venue whose
 * OpenStreetMap lookup has been stored, and today that happens only when a parent opens a venue page: 8 of 155 stored
 * places in production. Without this the filters stay nearly empty, and an empty filter is what a parent would misread
 * as "no food near any venue".
 *
 * WHY NOT ONE REQUEST PER VENUE. The first design asked ~150 small questions, ten seconds apart, because that totalled
 * less than Overpass's published ceiling for casual use (under 10,000 queries and 1 GB a day, divided by 100 for
 * anything regular). Being under a ceiling is not the same as being the right shape: the whole point of a one-off is
 * that it need not look like regular use, and the courteous shape for a public instance is FEW queries, run once, with
 * the answers kept. One batched query returns every food place within walking distance of any anchor in the batch; each
 * element is then assigned back to the anchors it is near, by distance, here, at no cost to the provider.
 *
 *   - Default: ceil(anchors / 70) queries, i.e. TWO for the ~138-venue catalogue (plus one lightweight /api/status
 *     read before starting). Hard ceiling: 4 queries, 100 anchors per query. Never parallel, at least MIN_PAUSE_S between
 *     queries. No retry and no second endpoint: the first error, rate-limit signal or failover STOPS the run.
 *   - One endpoint, the primary public instance, identified by a contact User-Agent. No mirror failover, no fallback.
 *   - Idempotent and restartable: every anchor already stored (fresh or stale) is skipped and costs nothing, so a second
 *     run after a partial first one asks only for the rest, and a complete one asks for nothing.
 *   - Persistence is required. If the answers cannot be stored the run refuses to start: requests whose answers are
 *     thrown away are pure load on a donated service.
 *   - The rows it writes are byte-for-byte the shape the venue page writes (same cache key, same payload), so the page
 *     and the filters read them and a later page view does not repeat the request.
 *   - No Google, no paid provider, no cron, no request-time querying. The only network collaborator is the injected
 *     `fetchBatch`, which in production is one POST to Overpass.
 *   - Every anchor is accounted for as attempted, succeeded, failed or skipped, with the reason.
 */

const DEFAULT_ANCHORS_PER_REQUEST = 70;
const HARD_ANCHORS_PER_REQUEST = 100;
const DEFAULT_MAX_REQUESTS = 3;
const HARD_MAX_REQUESTS = 4;
const MIN_PAUSE_S = 60;
const DEFAULT_PAUSE_S = 90;

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

/** Contiguous strips by longitude: neighbours share a batch, so overlapping neighbourhoods are downloaded once. */
function planBatches(anchors, perRequest) {
  const ordered = [...anchors].sort((a, b) => a.longitude - b.longitude || a.latitude - b.latitude);
  const batches = [];
  for (let i = 0; i < ordered.length; i += perRequest) batches.push(ordered.slice(i, i + perRequest));
  return batches;
}

/** What the venue page would have stored for this anchor, computed from a batch response already in hand. */
function payloadForAnchor(anchor, elements, radiusM, fetchedAt) {
  const near = elements.filter((el) => {
    const lat = el?.lat ?? el?.center?.lat;
    const lng = el?.lon ?? el?.center?.lon;
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat - anchor.latitude) < 0.05 && Math.abs(lng - anchor.longitude) < 0.08;
  });
  const validated = near.map((el) => elementToCandidate(el, anchor)).filter(Boolean).filter((c) => c.distanceKm * 1000 <= radiusM);
  const deduped = dedupeCandidates(validated).sort((a, b) => a.distanceKm - b.distanceKm);
  // Nearest first, so the cap keeps the walkable places (the page's own query keeps an arbitrary 60).
  const candidates = deduped.slice(0, MAX_ELEMENTS);
  return {
    candidates,
    radiusM,
    fetchedAt,
    discovery: { rawElements: near.length, elementCap: MAX_ELEMENTS, saturatedCap: deduped.length > MAX_ELEMENTS, afterValidation: validated.length, afterDedupe: deduped.length, batched: true },
  };
}

/**
 * @param {{ places: object[] }} input
 * @param {{
 *   apply: boolean, perRequest?: number, maxRequests?: number, pauseSeconds?: number, radiusM?: number,
 *   fetchBatch: (anchors: object[], radiusM: number) => Promise<{ elements: object[], httpRequests: number }>,
 *   store: (anchor: object, payload: object) => Promise<void>,
 *   isStored: (key: string) => Promise<boolean>,
 *   canPersist: () => boolean,
 *   preflight?: () => Promise<{ ok: boolean, reason?: string }>,
 *   sleep: (ms: number) => Promise<void>,
 *   now?: () => string,
 *   log?: (line: object) => void,
 * }} deps
 */
async function runFoodBackfill({ places }, deps) {
  const log = deps.log ?? (() => {});
  const radiusM = deps.radiusM ?? DEFAULT_RADIUS_M;
  const perRequest = Math.min(Math.max(Math.floor(deps.perRequest ?? DEFAULT_ANCHORS_PER_REQUEST), 1), HARD_ANCHORS_PER_REQUEST);
  const maxRequests = Math.min(Math.max(Math.floor(deps.maxRequests ?? DEFAULT_MAX_REQUESTS), 1), HARD_MAX_REQUESTS);
  const pauseMs = Math.max(deps.pauseSeconds ?? DEFAULT_PAUSE_S, MIN_PAUSE_S) * 1000;
  const anchors = planAnchors(places);
  const ledger = { anchors: anchors.length, requests: 0, attempted: 0, succeeded: 0, failed: 0, skipped: 0, withFoodWithin10: 0, nothingMapped: 0, stoppedBecause: null, batches: [], entries: [] };
  const note = (entry) => {
    ledger.entries.push(entry);
    log(entry);
  };

  // Which anchors still need an answer (a stored row, fresh or stale, is an answer).
  const todo = [];
  for (const anchor of anchors) {
    if (deps.apply && (await deps.isStored(anchor.key))) {
      ledger.skipped += 1;
      note({ anchor: anchor.id, name: anchor.name, outcome: 'skipped', reason: 'already stored' });
    } else todo.push(anchor);
  }
  const batches = planBatches(todo, perRequest);
  ledger.plannedRequests = Math.min(batches.length, maxRequests);

  if (!deps.apply) {
    // Plan only: nothing is read from the provider and nothing is written.
    for (const a of todo) note({ anchor: a.id, name: a.name, outcome: 'planned' });
    ledger.stoppedBecause = 'plan only (no --apply)';
    return ledger;
  }
  if (batches.length > 0 && !deps.canPersist()) {
    ledger.stoppedBecause = 'refused: results cannot be stored, so the requests would be wasted load';
  } else if (batches.length > 0 && deps.preflight) {
    const gate = await deps.preflight();
    if (!gate.ok) ledger.stoppedBecause = `provider not ready: ${gate.reason ?? 'status check failed'}`;
  }

  if (!ledger.stoppedBecause) {
    for (const batch of batches) {
      if (ledger.requests >= maxRequests) {
        ledger.stoppedBecause = `request cap of ${maxRequests} reached`;
        break;
      }
      if (ledger.requests > 0) await deps.sleep(pauseMs);
      ledger.requests += 1;
      ledger.attempted += batch.length;
      let response;
      try {
        response = await deps.fetchBatch(batch, radiusM);
      } catch (error) {
        ledger.failed += batch.length;
        for (const a of batch) note({ anchor: a.id, name: a.name, outcome: 'failed', error: String(error?.message ?? error).slice(0, 160) });
        ledger.stoppedBecause = 'stopped on the first provider error';
        break;
      }
      const fetchedAt = (deps.now ?? (() => new Date().toISOString()))();
      const elements = Array.isArray(response?.elements) ? response.elements : [];
      ledger.batches.push({ anchors: batch.length, elements: elements.length, httpRequests: response?.httpRequests ?? 1 });
      let storeFailed = false;
      for (const a of batch) {
        try {
          const payload = payloadForAnchor(a, elements, radiusM, fetchedAt);
          await deps.store(a, payload);
          ledger.succeeded += 1;
          const within10 = payload.candidates.some((c) => estimateWalkMinutes(a.latitude, a.longitude, c.latitude, c.longitude) <= 10);
          if (within10) ledger.withFoodWithin10 += 1;
          if (payload.candidates.length === 0) ledger.nothingMapped += 1;
          note({ anchor: a.id, name: a.name, outcome: 'succeeded', candidates: payload.candidates.length, withinTenMinuteWalk: within10 });
        } catch (error) {
          ledger.failed += 1;
          storeFailed = true;
          note({ anchor: a.id, name: a.name, outcome: 'failed', error: `could not store: ${String(error?.message ?? error).slice(0, 140)}` });
        }
      }
      if (storeFailed) {
        ledger.stoppedBecause = 'stopped: an answer could not be stored';
        break;
      }
      if (Number(response?.httpRequests ?? 1) > 1) {
        ledger.stoppedBecause = 'stopped: the provider needed a retry or failover, which is a back-off signal';
        break;
      }
    }
  }
  // Anything not reached is skipped, with the reason, so the ledger always balances.
  const seen = new Set(ledger.entries.map((e) => e.anchor));
  for (const anchor of anchors) {
    if (!seen.has(anchor.id)) {
      ledger.skipped += 1;
      note({ anchor: anchor.id, name: anchor.name, outcome: 'skipped', reason: ledger.stoppedBecause ?? 'not reached' });
    }
  }
  return ledger;
}

module.exports = {
  runFoodBackfill, planAnchors, planBatches, payloadForAnchor,
  DEFAULT_ANCHORS_PER_REQUEST, HARD_ANCHORS_PER_REQUEST, DEFAULT_MAX_REQUESTS, HARD_MAX_REQUESTS, MIN_PAUSE_S, DEFAULT_PAUSE_S,
};
