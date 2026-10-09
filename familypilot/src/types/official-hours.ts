/**
 * What a venue's OWN pages say about when it is open, as a structured reading a person has approved.
 *
 * The provider's hours (Google) are the baseline for every venue, and they are wrong often enough to matter: in the pilot,
 * London Zoo's closing time moves from 5pm to 4pm on 24 October, Mudchute Park and Farm is listed as closed on Mondays when the
 * farm is open every day, and Gunnersbury Park is listed as open 24 hours when the park gates are 7am until dusk. A weekly
 * pattern cannot say "from 24 October" or "the museum, not the park", so these readings carry a season and a part of the venue.
 *
 * Stored as `hours.<id>` venue claims (source page, quote, date, approver), projected read-only like venue rules. They never
 * replace the provider's hours silently: see `reconcileHours`.
 */
export interface OfficialHoursRule {
  id: string;
  /** The whole venue, or one named part of it ("Museum"). Only the whole venue's hours can contradict or replace the provider's. */
  scope: 'venue' | 'area';
  area?: string | null;
  /** Inclusive season, `YYYY-MM-DD`. Both absent: all year. */
  from?: string | null;
  until?: string | null;
  /** Days of the week it applies on (0 = Sunday). */
  days: number[];
  /** `HH:MM`. */
  open: string;
  /** `HH:MM`, or null when the page gives no clock time ("until dusk"); then `closeText` carries the page's words. */
  close: string | null;
  closeText?: string | null;
  /** The last time anyone is let in, when the page says. Shown, never used to decide that the venue is open or shut. */
  lastEntry?: string | null;
  sourceUrl?: string | null;
  checkedAt?: string | null;
}
