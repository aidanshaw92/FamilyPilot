import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { toPlanViewModel, type PlanViewModelInput } from '@/src/services/planning/plan-view-model';
import {
  MAX_SHARED_JSON,
  OWN_LABEL,
  SharedDayTooLargeError,
  buildSharedDay,
  connectedFamilyId,
  hasUnconnectedFamily,
  isSharedDayEnvelope,
  outingText,
  reframeForRecipient,
  sharedDayRecipients,
} from '@/src/services/planning/shared-day';

const load = (): PlanViewModelInput => JSON.parse(readFileSync(join(__dirname, 'fixtures', 'saved-day-with-private-detail.json'), 'utf8')).source;
const CONN = 'conn1';
const PRIVATE = [/nap/i, /Ozzie/i, /wheelchair/i, /routines you entered/i, /imageUrl/, /example\.test/, /acceptedConflict/, /nap-c2/];

describe('what leaves the sender’s phone', () => {
  it('is the outing, with every routine, child, need and cached photo of the sender removed', () => {
    const envelope = buildSharedDay(load(), CONN, 'A day at Russell Square');
    const json = JSON.stringify(envelope);
    for (const re of PRIVATE) expect(json, String(re)).not.toMatch(re);
    expect(envelope.day.itinerary.routineInsights).toEqual([]);
    expect(envelope.day.itinerary.homeAfter).toEqual([]);
    expect(envelope.day.itinerary.families.every((f) => f.notes.length === 0)).toBe(true);
    expect(envelope.day.hasRoutines).toBe(false);
    expect(envelope.day.alternatives).toEqual([]);
    expect(envelope.day.acceptedConflict).toBeUndefined();
  });

  it('keeps what the plan is for: places, times, each family’s leave and home time, the venue’s own facts', () => {
    const src = load();
    const envelope = buildSharedDay(src, CONN, 'A day at Russell Square');
    expect(envelope.day.itinerary.stops.map((s) => s.name)).toEqual(src.itinerary.stops.map((s) => s.name));
    expect(envelope.day.itinerary.families.map((f) => [f.familyId, f.depart, f.home])).toEqual(src.itinerary.families.map((f) => [f.familyId, f.depart, f.home]));
    expect(envelope.day.anchorFacts).toBeDefined();
    expect(envelope.day.parking).toEqual(src.parking);
    expect(envelope.day.itinerary.unknowns.every((u) => /^(Opening hours|Recommended ages)/.test(u))).toBe(true);
  });

  it('hides what the sender needs but returns the recipient’s own must-have to them', () => {
    const envelope = buildSharedDay(load(), CONN, 'x');
    const mine = envelope.day.itinerary.unresolvedMustHaves.filter((m) => m.familyId === 'mine');
    const theirs = envelope.day.itinerary.unresolvedMustHaves.filter((m) => m.familyId === connectedFamilyId(CONN));
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((m) => m.field === 'undisclosed')).toBe(true);
    expect(theirs.length).toBeGreaterThan(0);
    expect(theirs.every((m) => m.field === 'familyFacilities.toilets')).toBe(true);
  });

  it('does not say which family uses a pushchair, except the recipient’s own', () => {
    const envelope = buildSharedDay(load(), CONN, 'x');
    expect(envelope.day.buggyFamilyIds).toEqual([connectedFamilyId(CONN)]);
  });

  it('is also a valid legacy plan, so an older build lists it instead of failing on it', () => {
    const envelope = buildSharedDay(load(), CONN, 'A day at Russell Square');
    expect(isSharedDayEnvelope(envelope)).toBe(true);
    expect(envelope.name).toBe('A day at Russell Square');
    expect(envelope.timings.map((t) => [t.familyId, t.depart, t.home])).toEqual(envelope.day.itinerary.families.map((f) => [f.familyId, f.depart, f.home]));
    expect(envelope.timings.every((t) => t.notes.length === 0)).toBe(true);
    expect(envelope.start).toBe(envelope.day.itinerary.stops[0].arrive);
  });

  it('fits what the endpoint accepts, trimming the least useful parts first, and says so when it cannot', () => {
    const src = load();
    expect(JSON.stringify(buildSharedDay(src, CONN, 'x')).length).toBeLessThanOrEqual(MAX_SHARED_JSON);
    const padded: PlanViewModelInput = { ...src, lunchFacts: { ...(src.lunchFacts as object), cuisine: 'x'.repeat(5000) } as PlanViewModelInput['lunchFacts'] };
    const trimmed = buildSharedDay(padded, CONN, 'x');
    expect(trimmed.day.lunchFacts).toBeUndefined();
    expect(JSON.stringify(trimmed).length).toBeLessThanOrEqual(MAX_SHARED_JSON);
    const huge: PlanViewModelInput = { ...src, itinerary: { ...src.itinerary, reasons: ['r'.repeat(9000)] } };
    expect(() => buildSharedDay(huge, CONN, 'x')).toThrow(SharedDayTooLargeError);
  });
});

describe('what the recipient reads', () => {
  const recipient = () => reframeForRecipient(buildSharedDay(load(), CONN, 'x').day, { connectionId: CONN, senderLabel: 'Anna’s family' });

  it('puts the recipient first as their own family and the sender as the connected family under their shared label', () => {
    const day = recipient();
    expect(day.itinerary.families.map((f) => [f.familyId, f.label])).toEqual([
      ['mine', OWN_LABEL],
      [connectedFamilyId(CONN), 'Anna’s family'],
    ]);
    expect(day.itinerary.legs.every((l) => ('familyId' in l ? ['mine', connectedFamilyId(CONN)].includes(l.familyId) : true))).toBe(true);
  });

  it('keeps each family’s own times with the right family', () => {
    const src = load();
    const sender = src.itinerary.families.find((f) => f.familyId === 'mine')!;
    const rec = src.itinerary.families.find((f) => f.familyId === connectedFamilyId(CONN))!;
    const day = recipient();
    const mineNow = day.itinerary.families.find((f) => f.familyId === 'mine')!;
    const otherNow = day.itinerary.families.find((f) => f.familyId === connectedFamilyId(CONN))!;
    expect([mineNow.depart, mineNow.home]).toEqual([rec.depart, rec.home]);
    expect([otherNow.depart, otherNow.home]).toEqual([sender.depart, sender.home]);
  });

  it('reads back neutrally: the sender’s need is never named, the recipient’s own is', () => {
    const view = toPlanViewModel(recipient());
    const text = JSON.stringify(view);
    for (const re of [/wheelchair/i, /nap/i, /Ozzie/i]) expect(text, String(re)).not.toMatch(re);
    const lines = view.needsChecking ?? [];
    expect(JSON.stringify(lines)).toMatch(/Something Anna’s family needs isn’t confirmed/);
    expect(JSON.stringify(lines)).toMatch(/[Tt]oilets/);
  });

  it('the sender’s own saved day is untouched by sharing it', () => {
    const src = load();
    const before = JSON.stringify(src);
    buildSharedDay(src, CONN, 'x');
    expect(JSON.stringify(src)).toBe(before);
  });
});

describe('who a day can go to', () => {
  it('lists the connected families in the day, and notices one added by postcode', () => {
    const src = load();
    expect(sharedDayRecipients(src)).toEqual([{ familyId: connectedFamilyId(CONN), connectionId: CONN, label: 'Kevin’s family' }]);
    expect(hasUnconnectedFamily(src)).toBe(false);
    const guest: PlanViewModelInput = JSON.parse(JSON.stringify(src).replaceAll(connectedFamilyId(CONN), 'guest-k'));
    expect(sharedDayRecipients(guest)).toEqual([]);
    expect(hasUnconnectedFamily(guest)).toBe(true);
  });

  it('can be said in a few lines for the share sheet, without anything private', () => {
    const text = outingText(load(), 'A day at Russell Square', 'Sat 17 Oct');
    expect(text).toMatch(/Russell Square/);
    expect(text).toMatch(/leave 09:35/);
    for (const re of PRIVATE) expect(text, String(re)).not.toMatch(re);
  });
});
