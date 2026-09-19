import {
  JourneyLegEstimate,
  JourneyMatrix,
  JourneyNodeKey,
} from '@/src/types/day-sequence';
import {
  BuildJourneyMatrixDeps,
  BuildJourneyMatrixInput,
  JourneyMatrixBuild,
  JourneyProbe,
  MissingJourneyLeg,
  PROVIDER_MAX_DESTINATIONS,
  StopLocation,
} from '@/src/types/journey-matrix-build';

import { PlanningFamily } from './planner';
import { homeKey, stopKey } from './sequencer';

/**
 * Builds the road-network travel times `sequenceDay` consumes.
 *
 * This is where every network call lives, so the sequencer can stay pure. The provider takes one
 * origin and many destinations, so the day becomes one probe per origin: each family home asking
 * for the anchor, and each stop asking for the other stops and every home. Asymmetry falls out of
 * that shape rather than being assumed — home to anchor and anchor to home are different origins,
 * so they are genuinely different measurements.
 *
 * Nothing here invents a number. A leg the provider estimated is present and labelled estimated;
 * a leg that never came back is absent, and `sequenceDay` already reports an absent leg as
 * travel-infeasible naming both ends. Those two must not be confused: one is a weaker answer, the
 * other is no answer.
 *
 * Provenance comes from each element, never from the batch. The endpoint reports a whole batch as
 * live when any single element was live, which would quietly turn estimates into measurements.
 *
 * For a plan on another date, every leg is recorded estimated however the provider answered: the
 * request asks for traffic now, and traffic now is not traffic on the day. Time-aware refinement
 * belongs on Google's Routes API (Compute Route Matrix), not on a wider integration with the
 * legacy Distance Matrix endpoint behind this.
 */

interface PlannedProbe {
  origin: JourneyNodeKey;
  probe: JourneyProbe;
  /** Destination node keys, in the order they were asked for. */
  expected: JourneyNodeKey[];
}

const hasCoordinates = (point: { latitude?: number; longitude?: number } | undefined): boolean =>
  Boolean(point) && Number.isFinite(point!.latitude) && Number.isFinite(point!.longitude);

function missingFor(
  from: JourneyNodeKey,
  tos: JourneyNodeKey[],
  reason: MissingJourneyLeg['reason'],
): MissingJourneyLeg[] {
  return tos.map((to) => ({ from, to, reason }));
}

/**
 * Works out which probes to send, and which legs are already unobtainable because a home or a
 * stop has no usable coordinates.
 */
function planProbes(input: BuildJourneyMatrixInput): {
  probes: PlannedProbe[];
  missing: MissingJourneyLeg[];
} {
  const { families, stops, locations } = input;
  const anchor = stops.find((stop) => stop.anchor);
  if (!anchor) throw new Error('A day is built around exactly one chosen place.');

  const locationFor = new Map(locations.map((location) => [location.placeId, location]));
  const placedStops = stops.filter((stop) => hasCoordinates(locationFor.get(stop.placeId)));
  const placedFamilies = families.filter((family) => hasCoordinates(family));

  const probes: PlannedProbe[] = [];
  const missing: MissingJourneyLeg[] = [];

  const anchorPlaced = placedStops.some((stop) => stop.placeId === anchor.placeId);

  // A family whose home we cannot place loses its rendezvous and its return from every stop.
  for (const family of families) {
    const from = homeKey(family.id);
    if (!hasCoordinates(family)) {
      missing.push(...missingFor(from, [stopKey(anchor.placeId)], 'invalid-coordinates'));
      for (const stop of stops) {
        missing.push(...missingFor(stopKey(stop.placeId), [from], 'invalid-coordinates'));
      }
      continue;
    }
    if (!anchorPlaced) {
      missing.push(...missingFor(from, [stopKey(anchor.placeId)], 'invalid-coordinates'));
      continue;
    }
    const anchorLocation = locationFor.get(anchor.placeId)!;
    probes.push({
      origin: from,
      probe: {
        origin: { latitude: family.latitude, longitude: family.longitude },
        destinations: [
          {
            placeId: stopKey(anchor.placeId),
            latitude: anchorLocation.latitude,
            longitude: anchorLocation.longitude,
          },
        ],
      },
      expected: [stopKey(anchor.placeId)],
    });
  }

  // A stop we cannot place loses its transfers and every return leg from it.
  for (const stop of stops) {
    const from = stopKey(stop.placeId);
    const origin = locationFor.get(stop.placeId);
    const others = stops.filter((other) => other.placeId !== stop.placeId);

    if (!hasCoordinates(origin)) {
      missing.push(
        ...missingFor(
          from,
          [
            ...others.map((other) => stopKey(other.placeId)),
            ...placedFamilies.map((family) => homeKey(family.id)),
          ],
          'invalid-coordinates',
        ),
      );
      continue;
    }

    // Any stop can be the last one, so every stop needs a way home for every family.
    const destinations = [
      ...others
        .filter((other) => hasCoordinates(locationFor.get(other.placeId)))
        .map((other) => {
          const location = locationFor.get(other.placeId)!;
          return {
            placeId: stopKey(other.placeId),
            latitude: location.latitude,
            longitude: location.longitude,
          };
        }),
      ...placedFamilies.map((family: PlanningFamily) => ({
        placeId: homeKey(family.id),
        latitude: family.latitude,
        longitude: family.longitude,
      })),
    ];

    const unplacedOthers = others.filter((other) => !hasCoordinates(locationFor.get(other.placeId)));
    missing.push(
      ...missingFor(from, unplacedOthers.map((other) => stopKey(other.placeId)), 'invalid-coordinates'),
    );

    if (!destinations.length) continue;
    probes.push({
      origin: from,
      probe: { origin: { latitude: origin!.latitude, longitude: origin!.longitude }, destinations },
      expected: destinations.map((destination) => destination.placeId),
    });
  }

  return { probes, missing };
}

function assertWithinProviderLimit(probes: PlannedProbe[]): void {
  // The provider slices a longer destination list away silently, returning fewer elements with no
  // error at all. Checking here turns what would be a day with inexplicably absent legs into a
  // loud failure at the point the mistake was made.
  const oversized = probes.find(
    (planned) => planned.probe.destinations.length > PROVIDER_MAX_DESTINATIONS,
  );
  if (oversized) {
    throw new Error(
      `A journey probe from ${oversized.origin} asks for ${oversized.probe.destinations.length} destinations, ` +
        `beyond the provider's limit of ${PROVIDER_MAX_DESTINATIONS}.`,
    );
  }
}

export async function buildJourneyMatrix(
  input: BuildJourneyMatrixInput,
  deps: BuildJourneyMatrixDeps,
): Promise<JourneyMatrixBuild> {
  const { probes, missing: unplaceable } = planProbes(input);
  assertWithinProviderLimit(probes);

  // One origin failing costs only its own legs: the rest of the day is still worth building, and
  // sequenceDay can report precisely which journey is unknown.
  const settled = await Promise.allSettled(probes.map((planned) => deps.probe(planned.probe)));

  // Traffic measured now is not traffic on another day, so nothing from a differently-dated plan
  // is allowed to keep a live label.
  const trafficDowngraded = input.families.length > 0 && deps.planDate !== deps.today;

  const legs: Record<JourneyNodeKey, Record<JourneyNodeKey, JourneyLegEstimate>> = {};
  const missing: MissingJourneyLeg[] = [...unplaceable];
  let live = 0;
  let estimated = 0;

  probes.forEach((planned, index) => {
    const outcome = settled[index];
    if (outcome.status === 'rejected') {
      missing.push(...missingFor(planned.origin, planned.expected, 'probe-failed'));
      return;
    }

    const elements = new Map(
      (outcome.value.journeys ?? []).map((journey) => [journey.placeId, journey]),
    );

    for (const destination of planned.expected) {
      const element = elements.get(destination);
      if (!element || !Number.isFinite(element.driveMinutes) || element.driveMinutes < 0) {
        missing.push({ from: planned.origin, to: destination, reason: 'no-element-returned' });
        continue;
      }

      const source = trafficDowngraded ? 'estimated' : element.source;
      if (source === 'live') live += 1;
      else estimated += 1;

      legs[planned.origin] = legs[planned.origin] ?? {};
      legs[planned.origin][destination] = { minutes: element.driveMinutes, source };
    }
  });

  const matrix: JourneyMatrix = { legs };
  return { matrix, missing, provenance: { live, estimated }, trafficDowngraded };
}
