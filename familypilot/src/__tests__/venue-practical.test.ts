import { describe, expect, it } from 'vitest';

import { beforeYouGoRows, childProvisionRows } from '@/src/utils/venue-practical';
import { FamilyMember, FamilyProfile } from '@/src/types';
import type { VenueRule } from '@/src/types/venue-rules';
import { REVIEWED_ACTIVITY_EVIDENCE } from '@/src/data/reviewed-activity-evidence';

const NOW = new Date('2026-10-09T10:00:00Z');
const parent: FamilyMember = { id: 'p', name: 'Alex', role: 'parent', dateOfBirth: '', age: 38 };
const child = (id: string, name: string, age: number, mobility: FamilyMember['mobility'] = ['walks'], ageMonths: number | null = null): FamilyMember => ({
  id, name, role: 'child', dateOfBirth: '', age, dobKnown: true, ageMonths, mobility,
});
const profile = (members: FamilyMember[], mustHaveFacilities: FamilyProfile['mustHaveFacilities'] = []): FamilyProfile =>
  ({ id: 'f', parentName: 'Alex', members: [parent, ...members], homeLocation: 'N1', budgetTier: 'moderate', maxDriveMinutes: 30, completionPercent: 100, mustHaveFacilities, routines: [] } as FamilyProfile);

const PUSHCHAIR: VenueRule = { id: 'pushchair-play', kind: 'pushchair', scope: 'area', area: 'play areas', coversCoreVisit: true, text: 'Pushchairs and buggies are not allowed in any storytelling or play area.', checkedAt: '2026-10-08', sourceUrl: 'https://example.org/visit' };
const GALLERY: VenueRule = { id: 'gallery', kind: 'closure', scope: 'area', area: 'Nature Gallery', until: '2027-02-05', text: 'The Nature Gallery is closed until 5 February 2027.', checkedAt: '2026-10-08' };
const OVER: VenueRule = { id: 'old-works', kind: 'closure', scope: 'area', area: 'Café', until: '2026-09-01', text: 'The café was closed for works until 1 September.', checkedAt: '2026-07-01' };
const FUTURE: VenueRule = { id: 'closing-soon', kind: 'closure', scope: 'venue', from: '2026-10-20', until: '2026-10-22', text: 'Closed from 20 to 22 October.', checkedAt: '2026-10-08' };
const QUEUE: VenueRule = { id: 'queue', kind: 'caution', scope: 'venue', text: 'Weekends can mean a queue to enter.', checkedAt: '2026-10-08' };

describe('Before you go', () => {
  it('lists what applies now or is coming, drops what is over, and puts this household’s own first', () => {
    const rows = beforeYouGoRows([QUEUE, OVER, GALLERY, FUTURE, PUSHCHAIR], profile([child('c', 'Theo', 1, ['buggy'])]), NOW);
    expect(rows.map((r) => r.key)).toEqual(['pushchair-play', 'closing-soon', 'gallery', 'queue']);
    expect(rows[0]).toMatchObject({ tone: 'important', forYou: true, area: 'play areas', checkedAt: '2026-10-08' });
    expect(rows.find((r) => r.key === 'queue')).toMatchObject({ tone: 'info', forYou: false });
  });

  it('keeps the pushchair rule visible to a family without a buggy, but not as a matter for them', () => {
    const rows = beforeYouGoRows([PUSHCHAIR], profile([child('c', 'Sloane', 5)]), NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].forYou).toBe(false);
  });

  it('shows nothing when no rule is recorded, never a statement that there are none', () => {
    expect(beforeYouGoRows(undefined, profile([child('c', 'Sloane', 5)]), NOW)).toEqual([]);
    expect(beforeYouGoRows([], null, NOW)).toEqual([]);
  });
});

describe('For children', () => {
  it('matches each child to the ages the venue itself states, and says nothing for a child it does not cover', () => {
    const entry = REVIEWED_ACTIVITY_EVIDENCE.find((e) => e.kind === 'provision' && e.maxMonthsExclusive - e.minMonths > 24 && e.minMonths >= 24)!;
    expect(entry).toBeDefined();
    const inside = Math.floor((entry.minMonths + entry.maxMonthsExclusive) / 2 / 12);
    const rows = childProvisionRows(entry.venueId, profile([child('a', 'Sloane', inside), child('b', 'Baby', 0, ['buggy'], 5)]), new Date(`${entry.evidence.retrievedAt}T12:00:00Z`));
    const row = rows.find((r) => r.label === entry.label)!;
    expect(row.suits).toEqual(['Sloane']);
    expect(row.onSetDays).toBe(false);
  });

  it('lets a reading lapse after its lifetime instead of showing stale provision', () => {
    const entry = REVIEWED_ACTIVITY_EVIDENCE[0];
    expect(childProvisionRows(entry.venueId, null, new Date('2027-06-01T00:00:00Z'))).toEqual([]);
  });
});
