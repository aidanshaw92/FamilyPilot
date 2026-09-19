import { contextApiClient } from '@/src/services/context/context-api-client';
import { JourneyProbe, JourneyProbeFn, JourneyProbeResult } from '@/src/types/journey-matrix-build';

/**
 * The real provider, behind the one function the matrix builder is allowed to call.
 *
 * Deliberately thin, and deliberately lossy in one direction: the endpoint's batch-level
 * `provider`, `source` and `fetchedAt` are dropped here and never reach the builder. The batch
 * reports itself as `live` whenever any single element was live, so carrying it further would
 * make it possible — eventually likely — for an estimate to be recorded as a measurement.
 * Per-element `source` survives untouched.
 *
 * Errors are left to propagate. The builder runs probes with `Promise.allSettled` and turns a
 * rejected origin into precisely the legs it could not obtain, which is better than this layer
 * inventing a fallback and hiding that anything went wrong.
 */
export const journeyProbe: JourneyProbeFn = async (
  probe: JourneyProbe,
): Promise<JourneyProbeResult> => {
  const result = await contextApiClient.getDriveTimes(probe.origin, probe.destinations);
  return {
    journeys: (result.journeys ?? []).map((journey) => ({
      placeId: journey.placeId,
      driveMinutes: journey.driveMinutes,
      source: journey.source,
    })),
  };
};
