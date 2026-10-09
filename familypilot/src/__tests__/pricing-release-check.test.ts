import { describe, expect, it } from 'vitest';

import { REVIEWED_ADMISSION } from '@/src/data/reviewed-admission-claims';
import { estimateFamilyAdmission, MAX_PRICE_AGE_DAYS, priceFreshness, priceFreshnessDays, priceIsCurrent, type Attendee } from '@/src/services/pricing/admission';
import { reviewedAdmissionFor } from '@/src/services/pricing/reviewed-admission';

/**
 * The release gate for the reviewed admission claims. Every published price must be:
 *   fresh       current on the release date, with a known date after which it stops being shown;
 *   sourced     the price's own source is the excerpt's page, read on the stated day, on the venue's own site;
 *   honest      for every household shape, a total covers every person in it (one line each), or it is one family
 *               ticket the party fits, or it is unknown. Never a total that leaves someone out.
 */

const RELEASE_DATE = '2026-10-08';
const ELIGIBLE_SCOPES = new Set(['venue_own_subtree', 'venue_named_page']);
const published = REVIEWED_ADMISSION.claims.filter((c) => c.decision === 'publish');

const adult = (n: number): Attendee => ({ id: `a${n}`, kind: 'adult', label: `Adult ${n}` });
const child = (n: number, ageMonths: number | null): Attendee => ({ id: `c${n}`, kind: 'child', ageMonths, label: `Child ${n}` });

/** Household shapes: one or two adults with up to four children, ages from newborn to 17, and one with an unknown age. */
const CHILD_AGES = [2, 18, 36, 60, 84, 132, 156, 204];
const PARTIES: Attendee[][] = [];
for (const adults of [1, 2]) {
  for (const kids of [0, 1, 2, 3, 4]) {
    for (let offset = 0; offset < CHILD_AGES.length; offset += 2) {
      const party: Attendee[] = Array.from({ length: adults }, (_, i) => adult(i + 1));
      for (let k = 0; k < kids; k += 1) party.push(child(k + 1, CHILD_AGES[(offset + k * 3) % CHILD_AGES.length]));
      PARTIES.push(party);
    }
  }
}
PARTIES.push([adult(1), adult(2), child(1, null)]);

describe('reviewed admission: release gate', () => {
  it('publishes exactly the reviewed decisions, and nothing held or refused', () => {
    expect(published.length).toBe(26);
    for (const c of REVIEWED_ADMISSION.claims) {
      expect(Boolean(reviewedAdmissionFor(c.venueId)), c.venueName).toBe(c.decision === 'publish');
    }
  });

  it.each(published.map((c) => [c.venueName, c] as const))('%s: sourced from its own page on the stated day', (_name, c) => {
    const pricing = c.pricing!;
    expect(pricing, 'a published claim carries a price').toBeTruthy();
    expect(pricing.source.url).toBe(c.evidence.url);
    expect(pricing.source.url.startsWith('https://') || pricing.source.url.startsWith('http://')).toBe(true);
    expect(pricing.source.checkedAt).toBe(c.evidence.retrievedAt);
    expect(c.evidence.retrievedAt <= REVIEWED_ADMISSION.preparedOn).toBe(true);
    expect(ELIGIBLE_SCOPES.has(c.evidence.subjectScope)).toBe(true);
    expect(c.evidence.excerpt.trim().length).toBeGreaterThanOrEqual(20);
  });

  it.each(published.map((c) => [c.venueName, c] as const))('%s: current on release, with a known end', (_name, c) => {
    const { source, status } = c.pricing!;
    expect(priceIsCurrent(source, RELEASE_DATE, status)).toBe(true);
    const checked = Date.parse(`${source.checkedAt}T00:00:00Z`);
    const day = (n: number) => new Date(checked + n * 86_400_000).toISOString().slice(0, 10);
    const window = priceFreshnessDays(status);
    expect(priceIsCurrent(source, day(window), status)).toBe(true);
    expect(priceFreshness(c.pricing!, day(window + 1)), `after ${window} days it is last-known, not current`).toBe('last-known');
    expect(priceFreshness(c.pricing!, day(MAX_PRICE_AGE_DAYS + 1)), 'after 400 days no figure at all').toBe('expired');
  });

  it.each(published.map((c) => [c.venueName, c] as const))('%s: a paid price states its tickets plainly', (_name, c) => {
    const p = c.pricing!;
    if (p.status === 'free') {
      expect(p.bands ?? []).toEqual([]);
      return;
    }
    const bands = p.bands ?? [];
    const family = p.familyTickets ?? [];
    expect(bands.length + family.length, 'a paid price has at least one ticket').toBeGreaterThan(0);
    for (const b of bands) {
      expect(Number.isInteger(b.amountPence) && b.amountPence >= 0).toBe(true);
      if (b.free) expect(b.amountPence).toBe(0);
    }
    for (const t of family) {
      expect(Number.isInteger(t.amountPence) && t.amountPence > 0).toBe(true);
      // A family ticket records exactly who it admits.
      expect(t.minAdults).toBeGreaterThanOrEqual(1);
      expect(t.maxAdults).toBeGreaterThanOrEqual(t.minAdults);
      expect(t.minChildren).toBeGreaterThanOrEqual(1);
      expect(t.maxChildren).toBeGreaterThanOrEqual(t.minChildren);
    }
  });

  it.each(published.map((c) => [c.venueName, c] as const))('%s: never a total that leaves someone out', (_name, c) => {
    const p = c.pricing!;
    for (const party of PARTIES) {
      const e = estimateFamilyAdmission(p, party, RELEASE_DATE);
      const shape = party.map((a) => (a.kind === 'adult' ? 'A' : `c${a.ageMonths}`)).join(' ');
      if (e.state === 'free') {
        expect(p.status, shape).toBe('free');
        continue;
      }
      if (e.state === 'unknown' || e.state === 'range') continue;
      if (e.basis === 'individual') {
        // One line per person, each person once.
        expect(e.lines.map((l) => l.attendeeId).sort(), shape).toEqual(party.map((a) => a.id).sort());
        expect(e.totalPence, shape).toBe(e.lines.reduce((s, l) => s + l.amountPence, 0));
      } else {
        // One family ticket that this party actually fits.
        const adults = party.filter((a) => a.kind === 'adult').length;
        const kids = party.filter((a) => a.kind === 'child');
        const fits = (p.familyTickets ?? []).some(
          (t) =>
            t.amountPence === e.totalPence &&
            adults >= t.minAdults && adults <= t.maxAdults &&
            kids.length >= t.minChildren && kids.length <= t.maxChildren &&
            (t.maxChildAgeMonthsExclusive === undefined || kids.every((k) => (k.ageMonths ?? Infinity) < (t.maxChildAgeMonthsExclusive as number))),
        );
        expect(fits, shape).toBe(true);
      }
    }
  });

  it('Museum of Brands: the £28 adult-only option is never what a family of four is told it costs', () => {
    const c = published.find((x) => x.venueName.startsWith('Museum of Brands'));
    expect(c).toBeTruthy();
    const e = estimateFamilyAdmission(c!.pricing!, [adult(1), adult(2), child(1, 48), child(2, 96)], RELEASE_DATE);
    expect(e.state).toBe('known');
    if (e.state === 'known') expect(e.totalPence).not.toBe(2800);
  });
});
