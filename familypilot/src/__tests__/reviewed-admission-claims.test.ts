import { describe, expect, it } from 'vitest';

import { REVIEWED_ADMISSION } from '@/src/data/reviewed-admission-claims';
import { mergePlaceToVenueDetail } from '@/src/services/places/merge-place';
import { reviewedAdmissionFor } from '@/src/services/pricing/reviewed-admission';
import {
  AdmissionPricing,
  admissionView,
  Attendee,
  estimateFamilyAdmission,
  priceBadge,
  priceIsCurrent,
  priceFreshnessDays,
} from '@/src/services/pricing/admission';

/**
 * The reviewed admission claims prepared from stored official pages (staged, not published). These checks are what makes a
 * claim publishable: its figures are the page's own, a "free" is a whole-venue statement, nothing is older than the freshness
 * window, and the calculator gives a family the answer the page supports (or says it cannot).
 */

interface Claim {
  venueId: string;
  venueName: string;
  decision: 'publish' | 'hold' | 'refuse';
  pricing?: AdmissionPricing;
  evidence: { url: string; retrievedAt: string; subjectScope: string; excerpt: string };
  reviewNotes: string;
}

const doc = REVIEWED_ADMISSION as unknown as { preparedOn: string; state: string; claims: Claim[] };
const claims = doc.claims;
const published = claims.filter((c) => c.decision === 'publish');
const byName = (name: string) => {
  const c = claims.find((x) => x.venueName === name);
  if (!c?.pricing) throw new Error(`no published pricing for ${name}`);
  return c.pricing;
};

const VISIT = '2026-11-14';
/** A price with its own short end (London Zoo's variable tickets, 30 days) is judged on a visit inside it. */
const visitFor = (p: { source: { validUntil?: string } }) => (p.source.validUntil && p.source.validUntil < VISIT ? p.source.validUntil : VISIT);
const ELIGIBLE_SCOPES = new Set(['venue_own_subtree', 'venue_named_page']);
const money = (pence: number) => `£${(pence / 100).toFixed(pence % 100 === 0 ? 0 : 2)}`;
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase();

/** Words that mean only part of a venue, or something other than entry, is free. Never in a published free claim. */
const PART_ONLY = ['hall', 'display', 'level ', 'stable yard', 'splash', 'car park', 'parking', 'go free', 'members', 'qualify for'];

const adult = (id: string): Attendee => ({ id, kind: 'adult', label: 'Adult' });
const child = (id: string, years: number): Attendee => ({ id, kind: 'child', ageMonths: years * 12, label: id });
const FAMILIES: Record<string, Attendee[]> = {
  'two adults, 4y and 1y': [adult('a1'), adult('a2'), child('Ava', 4), child('Ben', 1)],
  'two adults, 7y and 10y': [adult('a1'), adult('a2'), child('Cal', 7), child('Dee', 10)],
  'one adult, 15y': [adult('a1'), child('Eli', 15)],
};

describe('reviewed admission claims: the file', () => {
  it('has about 30 reviewed venues with one decision each', () => {
    expect(doc.state).toBe('reviewed');
    expect(claims.length).toBeGreaterThanOrEqual(30);
    expect(new Set(claims.map((c) => c.venueId)).size).toBe(claims.length);
    expect(claims.filter((c) => c.decision === 'publish')).toHaveLength(26);
    expect(claims.filter((c) => c.decision === 'hold')).toHaveLength(8);
    expect(claims.filter((c) => c.decision === 'refuse')).toHaveLength(4);
  });

  it('every claim cites a page from the venue itself, with a date and the page\'s own words', () => {
    for (const c of claims) {
      expect(ELIGIBLE_SCOPES.has(c.evidence.subjectScope), c.venueName).toBe(true);
      expect(c.evidence.url, c.venueName).toMatch(/^https:\/\//);
      expect(c.evidence.retrievedAt, c.venueName).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.evidence.excerpt.length, c.venueName).toBeGreaterThan(20);
      expect(c.reviewNotes.length, c.venueName).toBeGreaterThan(10);
    }
  });

  it('only published claims carry pricing, and their source is the evidence page and date', () => {
    for (const c of claims) {
      if (c.decision !== 'publish') {
        expect(c.pricing, c.venueName).toBeUndefined();
        continue;
      }
      expect(c.pricing!.source.url, c.venueName).toBe(c.evidence.url);
      expect(c.pricing!.source.checkedAt, c.venueName).toBe(c.evidence.retrievedAt);
    }
  });

  it('every price is no older than the freshness window when prepared and still current for a visit next month', () => {
    const prepared = Date.parse(doc.preparedOn);
    for (const c of published) {
      const ageDays = (prepared - Date.parse(c.pricing!.source.checkedAt)) / 86_400_000;
      expect(ageDays, c.venueName).toBeGreaterThanOrEqual(0);
      expect(ageDays, c.venueName).toBeLessThanOrEqual(priceFreshnessDays(c.pricing!.status));
      expect(priceIsCurrent(c.pricing!.source, visitFor(c.pricing!), c.pricing!.status), c.venueName).toBe(true);
    }
  });
});

describe('reviewed admission claims: free means the whole venue', () => {
  const free = published.filter((c) => c.pricing!.status === 'free');

  it('has 20 free-entry claims, each stating free entry in the page\'s words', () => {
    expect(free).toHaveLength(20);
    for (const c of free) {
      expect(norm(c.evidence.excerpt), c.venueName).toMatch(/free (to visit|entry|for all visitors|admission ticket)|admission is free/);
      expect(c.pricing!.bands, c.venueName).toBeUndefined();
    }
  });

  it('no published free claim rests on a part, an add-on or a band', () => {
    for (const c of free) {
      const text = norm(c.evidence.excerpt);
      for (const phrase of PART_ONLY) expect(text.includes(phrase), `${c.venueName}: "${phrase}"`).toBe(false);
    }
  });

  it('every refusal is a part-only free statement, and none of those venues is published', () => {
    const refused = claims.filter((c) => c.decision === 'refuse');
    for (const c of refused) {
      const text = norm(c.evidence.excerpt);
      expect(PART_ONLY.some((p) => text.includes(p)), c.venueName).toBe(true);
      expect(text, c.venueName).toContain('free');
    }
    const refusedIds = new Set(refused.map((c) => c.venueId));
    expect(published.some((c) => refusedIds.has(c.venueId))).toBe(false);
  });

  it('a free venue with charged parts names them as conditions', () => {
    for (const name of ['Horniman Museum and Gardens', 'National Maritime Museum', 'Tate Britain', 'Tate Modern', 'Whitechapel Gallery']) {
      expect(byName(name).conditions?.length, name).toBeGreaterThan(0);
    }
    expect(priceBadge(byName('Horniman Museum and Gardens'), VISIT)).toEqual({ kind: 'free', text: 'Free entry' });
  });
});

describe('reviewed admission claims: paid figures are the page\'s own', () => {
  const paid = published.filter((c) => c.pricing!.status === 'paid');

  it('has 6 paid claims, and every amount appears in the cited excerpt', () => {
    expect(paid).toHaveLength(6);
    for (const c of paid) {
      // The pages print "£ 27.70" with a space; whitespace is normalised, so compare without it.
      const excerpt = c.evidence.excerpt.replace(/£\s+/g, '£');
      const allBands = [...(c.pricing!.bands ?? []), ...(c.pricing!.tiers ?? []).flatMap((t) => t.bands)];
      for (const b of allBands) {
        if (b.free) {
          expect(b.amountPence, c.venueName).toBe(0);
          expect(norm(c.evidence.excerpt), c.venueName).toContain('free');
        } else {
          expect(b.amountPence, c.venueName).toBeGreaterThan(0);
          expect(excerpt, `${c.venueName} ${b.label}`).toContain(money(b.amountPence));
        }
      }
      for (const t of c.pricing!.familyTickets ?? []) expect(excerpt, c.venueName).toContain(money(t.amountPence));
    }
  });

  it('London Zoo: four day-type tables, an adult and a child band in each, under-3s free, and a range because no calendar is recorded', () => {
    const p = byName('London Zoo');
    expect(p.bands).toBeUndefined();
    expect(p.tiers!.map((t) => t.label)).toEqual(['Off Peak', 'Weekday Standard', 'Standard Weekend', 'Peak']);
    expect(p.tiers!.map((t) => t.bands.find((b) => b.kind === 'adult')!.amountPence)).toEqual([2770, 3180, 3360, 3450]);
    expect(p.tiers!.map((t) => t.bands.find((b) => b.kind === 'child')!.amountPence)).toEqual([1940, 2220, 2350, 2410]);
    for (const t of p.tiers!) expect(t.bands.find((b) => b.kind === 'under')).toMatchObject({ free: true, amountPence: 0, maxAgeMonthsExclusive: 36 });
    // Two adults, a 4-year-old and a 1-year-old: the range is across the tables; the baby adds nothing; no single total is claimed.
    const est = estimateFamilyAdmission(p, [adult('a1'), adult('a2'), child('Ava', 4), child('Ben', 1)], visitFor(p));
    expect(est.state).toBe('range');
    if (est.state === 'range') {
      expect(est.lowPence).toBe(2 * 2770 + 1940);
      expect(est.highPence).toBe(2 * 3450 + 2410);
    }
    // A 16-year-old is in no stated child band and is not an adult band: unknown, never guessed.
    expect(estimateFamilyAdmission(p, [adult('a1'), child('Eli', 16)], visitFor(p)).state).toBe('unknown');
  });

  it('Science Museum: free general admission, with the condition that a ticket can be booked', () => {
    const p = byName('Science Museum');
    expect(p.status).toBe('free');
    expect(p.conditions!.join(' ')).toMatch(/General admission is free/);
    expect(estimateFamilyAdmission(p, FAMILIES['two adults, 4y and 1y'], VISIT).state).toBe('free');
  });

  it('adult bands have no age limits and child bands always do, so nobody is priced by a guessed age', () => {
    for (const c of paid) {
      for (const b of c.pricing!.bands ?? []) {
        if (b.kind === 'adult') {
          expect(b.minAgeMonths, c.venueName).toBeUndefined();
          expect(b.maxAgeMonthsExclusive, c.venueName).toBeUndefined();
        }
        if (b.kind === 'child' || b.kind === 'under') expect(b.minAgeMonths, c.venueName).toBeDefined();
      }
    }
  });

  it('uses the standard price where a Gift Aid price is also listed, and keeps the other as a condition', () => {
    const p = byName('De Havilland Aircraft Museum');
    expect(p.bands!.find((b) => b.kind === 'adult')!.amountPence).toBe(1200);
    expect(p.bands!.find((b) => b.kind === 'child')!.amountPence).toBe(650);
    expect(p.conditions!.join(' ')).toMatch(/Gift Aid/);
    // The family ticket's composition is not stated, so it is not used in any total.
    expect(p.familyTickets).toBeUndefined();
  });

  it('records a family ticket only with its stated limits', () => {
    const t = byName('Museum of Brands').familyTickets!;
    expect(t).toEqual([expect.objectContaining({ amountPence: 3600, minAdults: 2, maxAdults: 2, minChildren: 2, maxChildren: 2 })]);
  });
});

describe('reviewed admission claims: what three families are told', () => {
  type Expect = number | 'free' | 'unknown';
  const table: Record<string, Record<string, Expect>> = {
    'Hanwell Zoo': { 'two adults, 4y and 1y': 1400, 'two adults, 7y and 10y': 1800, 'one adult, 15y': 900 },
    // A child under 7 has no stated band, so these parties are priced by the family ticket they fit (see the review note).
    'Museum of Brands': { 'two adults, 4y and 1y': 3600, 'two adults, 7y and 10y': 3600, 'one adult, 15y': 2200 },
    'The Sherlock Holmes Museum': { 'two adults, 4y and 1y': 3800, 'two adults, 7y and 10y': 6600, 'one adult, 15y': 3300 },
    'De Havilland Aircraft Museum': { 'two adults, 4y and 1y': 'unknown', 'two adults, 7y and 10y': 3700, 'one adult, 15y': 1850 },
    'London Cable Car': { 'two adults, 4y and 1y': 'unknown', 'two adults, 7y and 10y': 4050, 'one adult, 15y': 2025 },
    'The National Gallery': { 'two adults, 4y and 1y': 'free', 'two adults, 7y and 10y': 'free', 'one adult, 15y': 'free' },
  };

  for (const [venue, rows] of Object.entries(table)) {
    for (const [family, want] of Object.entries(rows)) {
      it(`${venue}: ${family} → ${typeof want === 'number' ? money(want) : want}`, () => {
        const e = estimateFamilyAdmission(byName(venue), FAMILIES[family], VISIT);
        if (want === 'free') expect(e.state).toBe('free');
        else if (want === 'unknown') {
          expect(e.state).toBe('unknown');
          if (e.state === 'unknown') expect(e.reason).toBe('attendee-not-covered');
        } else {
          expect(e.state).toBe('known');
          if (e.state === 'known') expect(e.totalPence).toBe(want);
        }
      });
    }
  }

  it('Museum of Brands compares the family ticket with individual tickets when both can be worked out', () => {
    const e = estimateFamilyAdmission(byName('Museum of Brands'), FAMILIES['two adults, 7y and 10y'], VISIT);
    expect(e.state === 'known' && e.basis).toBe('family-ticket');
    expect(e.state === 'known' && e.alternative).toEqual({ basis: 'individual', totalPence: 4400 });
  });

  it('a teenager past every stated child band is unknown, not charged as an adult', () => {
    const e = estimateFamilyAdmission(byName('The Sherlock Holmes Museum'), [adult('a1'), child('Fay', 16)], VISIT);
    expect(e.state).toBe('unknown');
  });

  it('every published claim gives a card label, and none is "Price not confirmed" for next month', () => {
    for (const c of published) expect(priceBadge(c.pricing, visitFor(c.pricing!)).kind, c.venueName).not.toBe('unknown');
  });
});

describe('reviewed admission claims: what the venue page is given', () => {
  const idOf = (name: string) => claims.find((c) => c.venueName === name)!.venueId;
  const view = (name: string, family: Attendee[]) => admissionView(estimateFamilyAdmission(reviewedAdmissionFor(idOf(name)), family, VISIT), reviewedAdmissionFor(idOf(name)));

  it('only a publish decision reaches a venue; hold, refuse and unknown venues get nothing, which reads "Price not confirmed"', () => {
    expect(reviewedAdmissionFor(idOf('Tate Britain'))?.status).toBe('free');
    expect(reviewedAdmissionFor(idOf('Hanwell Zoo'))?.status).toBe('paid');
    for (const c of claims.filter((x) => x.decision !== 'publish')) expect(reviewedAdmissionFor(c.venueId), c.venueName).toBeNull();
    expect(reviewedAdmissionFor('fp-google-not-a-venue')).toBeNull();
    expect(view('The Courtauld Gallery', FAMILIES['two adults, 4y and 1y']).headline).toBe('Price not confirmed');
    expect(view('Cutty Sark', FAMILIES['two adults, 4y and 1y']).headline).toBe('Price not confirmed');
  });

  it('free general entry stays distinct from what is charged inside', () => {
    const v = view('Horniman Museum and Gardens', FAMILIES['two adults, 7y and 10y']);
    expect(v.headline).toBe('Free entry');
    expect(v.conditions.join(' ')).toMatch(/charge for the Aquarium, the Butterfly House/);
  });

  it('Museum of Brands, two adults with a 4-year-old and a 1-year-old: the verified family ticket and why, never an invented £28', () => {
    const v = view('Museum of Brands', FAMILIES['two adults, 4y and 1y']);
    expect(v.headline).toBe('Family ticket £36');
    const all = [v.headline, ...v.breakdown, ...v.conditions].join(' ');
    expect(all).not.toMatch(/£28/);
    expect(all).toMatch(/Ask the venue whether a cheaper way in applies/);
    expect(all).toMatch(/under 6s are free only in the Universal Credit ticket section/);
    // ...and where every ticket can be worked out, the family ticket is compared, not assumed.
    expect(view('Museum of Brands', FAMILIES['two adults, 7y and 10y']).breakdown.join(' ')).toMatch(/Buying individually would be £44/);
  });

  it('the venue detail record carries the reviewed price, whatever the venue’s enrichment status', () => {
    const place = { familypilotId: idOf('Hanwell Zoo'), name: 'Hanwell Zoo', category: 'zoo', latitude: 51.51, longitude: -0.34, photos: [], provider: 'google' };
    const detail = mergePlaceToVenueDetail(place as never, null, 51.5, -0.3);
    expect(detail.admission?.bands?.find((b: { kind: string }) => b.kind === 'adult')?.amountPence).toBe(500);
    const unpriced = mergePlaceToVenueDetail({ ...place, familypilotId: 'fp-google-unpriced' } as never, null, 51.5, -0.3);
    expect(unpriced.admission).toBeUndefined();
  });
});

describe('a current price that does not cover the party is not a stale price', () => {
  it('one adult and a 3-year-old at Museum of Brands: "not confirmed for your party", with whom it does not cover', () => {
    const pricing = reviewedAdmissionFor(claims.find((c) => c.venueName === 'Museum of Brands')!.venueId);
    const v = admissionView(estimateFamilyAdmission(pricing, [adult('a1'), child('Sloane', 3)], VISIT), pricing);
    expect(v.headline).toBe('Price not confirmed for your party');
    expect(v.breakdown.join(' ')).toMatch(/No ticket on record covers Sloane at this age/);
    expect(v.provenance).toMatch(/^Prices checked /);
    expect(v.provenance).not.toMatch(/Last price on record/);
  });
});
