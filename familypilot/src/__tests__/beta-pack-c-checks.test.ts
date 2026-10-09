import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

import { REVIEWED_ADMISSION } from '@/src/data/reviewed-admission-claims';
import { activityEvidenceFor, evidenceCovers } from '@/src/services/matching/activity-evidence';
import { extractMatchableFacts } from '@/src/services/matching/venue-facts';
import { evaluateVenueRules, ruleAppliesOn } from '@/src/services/matching/venue-rules';
import { reconcileHours } from '@/src/services/places/hours-reconcile';
import { isOpenOn } from '@/src/utils/opening-hours';
import { priceFreshness } from '@/src/services/pricing/admission';
import { childProvisionRows } from '@/src/utils/venue-practical';
import { NOT_CONFIRMED, familyEssentialRows } from '@/src/utils/family-essentials';
import type { FamilyProfile, VenueDetail } from '@/src/types';
import type { VenueRule } from '@/src/types/venue-rules';

const req = createRequire(import.meta.url);
const { projectActiveClaimsToPayload, isClaimActive } = req('../../../server/enrichment/_lib/claims-store.js') as {
  projectActiveClaimsToPayload: (c: unknown[]) => unknown;
  isClaimActive: (c: unknown, today?: string) => boolean;
};

const ZOO = 'fp-google-ChIJV_iXMtcadkgRqBI84CY_crE';
const SCI = 'fp-google-ChIJP9oAE0MFdkgR3iKGFKZO1SE';
const HOR = 'fp-google-ChIJSzwgydoDdkgRndnXVYQGXBI';
const DIS = 'fp-google-ChIJJ2CD1mEddkgRAuOi9iSzBrk';
const NOW = new Date('2026-10-12T12:00:00Z');

describe('ZooTown never counts a newborn as covered just because the lower bound is zero', () => {
  const zootown = () => activityEvidenceFor(ZOO, NOW).find((e) => /^ZooTown/.test(e.label))!;
  it('covers 12 months up to (not including) 9 years, and no younger child', () => {
    const z = zootown();
    expect(z.minMonths).toBe(12);
    for (const months of [0, 1, 6, 11]) expect(evidenceCovers(z, months), `${months} months`).toBe(false);
    for (const months of [12, 36, 95, 107]) expect(evidenceCovers(z, months), `${months} months`).toBe(true);
    expect(evidenceCovers(z, 108)).toBe(false);
  });
  it('the Venue Detail "For children" row does not say it suits a newborn', () => {
    const profile = { members: [{ role: 'child', name: 'Newborn', age: 0, ageMonths: 1 }, { role: 'child', name: 'Baby', age: 0, ageMonths: 8 }, { role: 'child', name: 'Five', age: 5 }] } as unknown;
    const row = childProvisionRows(ZOO, profile as unknown as FamilyProfile, NOW).find((r) => /^ZooTown/.test(r.label))!;
    expect(row.suits).toEqual(['Five']); // not Newborn (1 month) and not Baby (8 months)
  });
});

describe('London Zoo variable ticket prices are short-lived', () => {
  const zoo = REVIEWED_ADMISSION.claims.find((c) => c.venueId === ZOO)!.pricing!;
  it('is current for 30 days from the reading, then only a dated last-known figure', () => {
    expect(zoo.source.validUntil).toBe('2026-11-07');
    expect(priceFreshness(zoo, '2026-11-07')).toBe('current');
    expect(priceFreshness(zoo, '2026-11-08')).toBe('last-known');
  });
});

describe('facility distinctions survive to what a parent sees', () => {
  const claim = (venue: string, fieldKey: string, valueJson: unknown) => ({ familypilotPlaceId: venue, fieldKey, valueJson, status: 'active', approvedBy: 'source_verified_ai_v1', validUntil: '2026-11-07', checkedAt: '2026-10-08' });
  const rowsFor = (venue: string, claims: Array<[string, unknown]>) => {
    const payload = projectActiveClaimsToPayload(claims.map(([k, v]) => claim(venue, k, v)));
    const facts = extractMatchableFacts(venue, 'V', 'museum', 10, 'verified', { enrichmentStatus: 'verified', ...(payload as object) } as never);
    return Object.fromEntries(familyEssentialRows({ id: venue, name: 'V', category: 'museum', openingHours: '', facilities: [], trustedFacts: facts } as unknown as VenueDetail).map((r) => [r.key, r]));
  };
  it('Science Museum: accessible toilets are not toilets; "no parking" sits beside a separate Blue Badge row', () => {
    const r = rowsFor(SCI, [['familyFacilities.parking', 'no'], ['accessibility.accessibleParking', 'yes'], ['accessibility.blueBadgeNote', 'A few spaces on Exhibition Road; 4 hours, 08.30 to 18.30'], ['accessibility.accessibleToilet', 'yes']]);
    expect(r.toilets).toMatchObject({ value: NOT_CONFIRMED, confirmed: false });
    expect(r['accessible-toilet']).toMatchObject({ value: 'On site', confirmed: true });
    expect(r.parking).toMatchObject({ value: 'None on site', confirmed: true });
    expect(r['blue-badge']).toMatchObject({ value: 'A few spaces on Exhibition Road; 4 hours, 08.30 to 18.30', confirmed: true });
  });
  it('Blue Badge location is never reduced to a bare "Available": on site, nearby and on a named street read differently', () => {
    const notes: Array<[string, string, RegExp]> = [
      [HOR, 'Limited bays on site', /on site/],
      [DIS, 'Bays nearby, not on site: Bridge Terrace, off Bridge Road', /not on site.*Bridge Terrace/],
      [SCI, 'A few spaces on Exhibition Road; 4 hours, 08.30 to 18.30', /Exhibition Road/],
    ];
    for (const [venue, note, pattern] of notes) {
      const r = rowsFor(venue, [['familyFacilities.parking', 'no'], ['accessibility.accessibleParking', 'yes'], ['accessibility.blueBadgeNote', note]]);
      expect(r.parking.value).toBe('None on site');
      expect(r['blue-badge'].value).toMatch(pattern);
      expect(r['blue-badge'].value).not.toBe('Available');
    }
    const bare = rowsFor(HOR, [['familyFacilities.parking', 'no'], ['accessibility.accessibleParking', 'yes']]);
    expect(bare['blue-badge'].value).toBe('Available'); // no location stated: the plain fact, not an invented place
    const orphan = rowsFor(HOR, [['accessibility.blueBadgeNote', 'Limited bays on site']]);
    expect(orphan['blue-badge']).toMatchObject({ value: NOT_CONFIRMED, confirmed: false }); // a note never outlives its claim
  });
  it('Discover: ordinary toilets do not fill the accessible-toilet row; London Zoo: the reverse', () => {
    const d = rowsFor(DIS, [['familyFacilities.toilets', 'yes']]);
    expect(d.toilets.value).toBe('On site');
    expect(d['accessible-toilet']).toMatchObject({ value: NOT_CONFIRMED, confirmed: false });
    const z = rowsFor(ZOO, [['accessibility.accessibleToilet', 'yes'], ['familyFacilities.parking', 'yes']]);
    expect(z.toilets.confirmed).toBe(false);
    expect(z['accessible-toilet'].value).toBe('On site');
    expect(z['blue-badge'].confirmed).toBe(false);
  });
});

describe('date-specific closures apply only on their dates, and lapse visibly', () => {
  const rule: VenueRule = { id: 'closed-christmas', kind: 'closure', scope: 'venue', from: '2026-12-24', until: '2026-12-26', text: 'Closed 24, 25 and 26 December.', checkedAt: '2026-10-08' };
  const visit = (date: string) => ({ date, today: '2026-10-12', usesPushchair: false, requiresPushchair: false, needsStepFree: false });
  it('applies on 24 to 26 December 2026 and on no other day, including 25 December 2027', () => {
    for (const d of ['2026-12-24', '2026-12-25', '2026-12-26']) { expect(ruleAppliesOn(rule, d)).toBe(true); expect(evaluateVenueRules([rule], visit(d)).closedAllDay).not.toBeNull(); }
    for (const d of ['2026-12-23', '2026-12-27', '2027-12-25', '2026-11-25']) { expect(ruleAppliesOn(rule, d)).toBe(false); expect(evaluateVenueRules([rule], visit(d)).closedAllDay).toBeNull(); }
  });
  it('its stored claim stops being served the day after it expires (7 Nov), so it must be renewed', () => {
    const c = { fieldKey: 'rules.closed-christmas', status: 'active', approvedBy: 'human:aidan', validUntil: '2026-11-07' };
    expect(isClaimActive(c, '2026-11-07')).toBe(true);
    expect(isClaimActive(c, '2026-11-08')).toBe(false);
  });
});

describe('a lapsed Christmas closure cannot leave a festive date looking like an ordinary open day', () => {
  const weekly = { timezone: 'Europe/London', periods: [1, 2, 3, 4, 5, 6, 0].map((day) => ({ open: { day, time: '1000' }, close: { day, time: '1800' } })) } as never;
  const official = [{ id: 'hours.daily', scope: 'venue', days: [0, 1, 2, 3, 4, 5, 6], open: '10:00', close: '18:00', checkedAt: '2026-10-08' }] as never;
  it('withholds the schedule (unknown, not closed, not open) and tells the parent to check, on each festive date', () => {
    for (const date of ['2026-12-24', '2026-12-25', '2026-12-26', '2026-12-31', '2027-01-01', '2027-12-25']) {
      const r = reconcileHours(weekly, official, date, '2026-12-01');
      expect(r.schedule, date).toBeUndefined();
      expect(r.note?.severity, date).toBe('important');
      expect(r.note?.text, date).toMatch(/Check with the venue before you go/);
      expect(isOpenOn(date, '11:00', '13:00', r.schedule).status, date).toBe('unknown');
    }
  });
  it('leaves ordinary days exactly as before', () => {
    for (const date of ['2026-12-23', '2026-12-27', '2026-12-30', '2027-01-02']) expect(reconcileHours(weekly, official, date, '2026-12-01').schedule, date).toBe(weekly);
  });
});
