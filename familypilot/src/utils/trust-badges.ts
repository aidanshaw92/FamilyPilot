import { EnrichmentStatus, Venue } from '@/src/types';
import { PlacesProviderName } from '@/src/types/places';

/**
 * The "Information confidence" badges under a Family Match explanation, built only from facts the
 * venue actually carries.
 *
 * Until now the row printed a literal "Last checked 2 days ago" and "Opening hours from provider"
 * for every venue, including ones nobody had checked and ones with no hours. Those were the two
 * most specific-sounding lines on the screen, and both were invented. A badge now appears only
 * when the data behind it exists; a venue with nothing to say gets no row at all.
 */
export interface TrustBadgeInput {
  enrichmentStatus?: EnrichmentStatus;
  trust?: Venue['trust'];
  provider?: PlacesProviderName;
  /** The provider's display copy for hours. The placeholder "not confirmed" copy does not count. */
  openingHours?: string;
  structuredOpeningHours?: unknown;
  estimatedSpend?: string;
}

const PROVIDER_NAME: Partial<Record<PlacesProviderName, string>> = {
  google: 'Google',
  osm: 'OpenStreetMap',
  familypilot: 'FamilyPilot',
};

/** "3 Oct 2026" from an ISO date; null for anything that does not parse as a real date. */
export function formatCheckedDate(iso: string | undefined): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}

export function trustBadgesFor(venue: TrustBadgeInput): string[] {
  const badges: string[] = [];

  // A check date is only a check date when FamilyPilot reviewed the place. For a provider-only
  // place `trust.lastChecked` is the day the provider record was fetched, which is not a review.
  const reviewed = venue.enrichmentStatus === 'enriched' || venue.enrichmentStatus === 'verified';
  const checked = reviewed ? formatCheckedDate(venue.trust?.lastChecked) : null;
  if (checked) badges.push(`Family details checked ${checked}`);

  const hasHours =
    Boolean(venue.structuredOpeningHours) ||
    (typeof venue.openingHours === 'string' &&
      venue.openingHours.trim().length > 0 &&
      !/not confirmed|unknown/i.test(venue.openingHours));
  const providerName = venue.provider ? PROVIDER_NAME[venue.provider] : undefined;
  if (hasHours && providerName) badges.push(`Opening hours from ${providerName}`);

  if (venue.estimatedSpend) badges.push('Estimated family cost');

  return badges;
}
