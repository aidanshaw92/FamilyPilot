import { REVIEWED_ADMISSION } from '@/src/data/reviewed-admission-claims';
import { AdmissionPricing } from '@/src/services/pricing/admission';

/**
 * The reviewed admission price for a venue, or null.
 *
 * Only a `publish` decision returns a price. A `hold` (a price exists but no ticket is plainly the general admission) and a
 * `refuse` (only part of the venue is free) return null, which every screen reads as "Price not confirmed": the absence of
 * a reviewed price is unknown, never free. Freshness is the calculator's job (`priceIsCurrent`, 400 days from the reading).
 */
const BY_VENUE = new Map(
  REVIEWED_ADMISSION.claims
    .filter((claim) => claim.decision === 'publish' && claim.pricing)
    .map((claim) => [claim.venueId, claim.pricing as AdmissionPricing]),
);

export function reviewedAdmissionFor(venueId: string | null | undefined): AdmissionPricing | null {
  if (!venueId) return null;
  return BY_VENUE.get(venueId) ?? null;
}
