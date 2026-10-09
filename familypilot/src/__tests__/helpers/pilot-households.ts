import type { FamilyMember, FamilyProfile } from '@/src/types';

/** The households the pilot analyses use (A to I are the original nine; J to N add very different ages and the separated access needs). One definition, so every analysis speaks about the same families. */
export const adult = (id: string, name: string): FamilyMember => ({ id, name, role: 'parent', dateOfBirth: '', age: 36 });
export const kid = (id: string, name: string, age: number, extra: Partial<FamilyMember> = {}): FamilyMember => ({
  id, name, role: 'child', dateOfBirth: '', age, dobKnown: true, ageMonths: age === 0 ? 8 : null, mobility: ['walks'], ...extra,
});
const home = (lat: number, lng: number, name: string) => ({ lat, lng, name });
const CAMDEN = home(51.539, -0.142, 'Camden');
const EALING = home(51.513, -0.305, 'Ealing');
const GREENWICH = home(51.482, 0.0, 'Greenwich');
const STRATFORD = home(51.541, 0.003, 'Stratford');

export interface Household { key: string; label: string; home: ReturnType<typeof home>; members: FamilyMember[]; limit: number | null; budget?: FamilyProfile['budgetTier']; must?: FamilyProfile['mustHaveFacilities']; pushchair?: string | null }
export const HOUSEHOLDS: Household[] = [
  { key: 'A', label: 'Preschooler (4) and baby (8m), buggy', home: CAMDEN, members: [adult('p', 'P'), kid('a', 'Mia', 4), kid('b', 'Leo', 0, { mobility: ['buggy'] })], limit: 90, pushchair: 'x' },
  { key: 'B', label: 'Baby only (8m), buggy', home: CAMDEN, members: [adult('p', 'P'), kid('b', 'Noah', 0, { mobility: ['buggy'] })], limit: 90, pushchair: 'x' },
  { key: 'C', label: 'Two school-age (7, 10)', home: CAMDEN, members: [adult('p', 'P'), kid('a', 'Cal', 7), kid('b', 'Dee', 10)], limit: 90 },
  { key: 'D', label: 'Toddler (2) with mobility aid, toilets', home: CAMDEN, members: [adult('p', 'P'), kid('a', 'Ivy', 2, { mobility: ['mobility-aid'] })], limit: 90, must: ['toilets'] },
  { key: 'E', label: 'Toddler (2) + preschooler (4), no buggy, 30-minute limit', home: CAMDEN, members: [adult('p', 'P'), kid('a', 'Ada', 2), kid('b', 'Ben', 4)], limit: 30 },
  { key: 'F', label: 'Baby (6m) in a sling only, 40-minute limit', home: EALING, members: [adult('p', 'P'), kid('b', 'Kit', 0, { mobility: ['carrier'], ageMonths: 6 })], limit: 40 },
  { key: 'G', label: 'Two older children (9, 12), Greenwich, no limit', home: GREENWICH, members: [adult('p', 'P'), kid('a', 'Fay', 9), kid('b', 'Gus', 12)], limit: null },
  { key: 'H', label: 'Pre-schooler (3), buggy must-have, Stratford, 20-minute limit', home: STRATFORD, members: [adult('p', 'P'), kid('a', 'Hal', 3, { mobility: ['buggy'] })], limit: 20, must: ['pushchair_friendly'], pushchair: 'x' },
  { key: 'I', label: 'Child (7) using a wheelchair, Blue Badge parking + toilets', home: EALING, members: [adult('p', 'P'), kid('a', 'Ida', 7, { mobility: ['mobility-aid'] })], limit: 60, must: ['blue_badge_parking', 'toilets'] },
  { key: 'J', label: 'Child (7) using a wheelchair, nothing else asked', home: EALING, members: [adult('p', 'P'), kid('a', 'Ida', 7, { mobility: ['mobility-aid'] })], limit: 60 },
  { key: 'K', label: 'Baby (6m) in a buggy, child (5) and teenager (13)', home: CAMDEN, members: [adult('p', 'P'), kid('a', 'Zed', 13), kid('b', 'Mia', 5), kid('c', 'Kit', 0, { mobility: ['buggy'], ageMonths: 6 })], limit: 60, pushchair: 'x' },
  { key: 'L', label: 'Toddler (2) and teenager (14), no limit', home: GREENWICH, members: [adult('p', 'P'), kid('a', 'Ivy', 2), kid('b', 'Max', 14)], limit: null },
  { key: 'M', label: 'Child (6), the carer holds a Blue Badge and needs Blue Badge parking', home: EALING, members: [adult('p', 'P'), kid('a', 'Pip', 6)], limit: 45, must: ['blue_badge_parking'] },
  { key: 'N', label: 'Child (9) using a wheelchair and a baby (10m) in a buggy', home: CAMDEN, members: [adult('p', 'P'), kid('a', 'Ada', 9, { mobility: ['mobility-aid'] }), kid('b', 'Bo', 0, { mobility: ['buggy'], ageMonths: 10 })], limit: 60, pushchair: 'x' },
];

export const profileFor = (h: Household): FamilyProfile => ({
  id: `fam-${h.key}`, parentName: 'P', members: h.members, homeLocation: h.home.name, homeLatitude: h.home.lat, homeLongitude: h.home.lng,
  ...(h.limit !== null ? { maxDriveMinutes: h.limit } : {}), budgetTier: h.budget ?? 'moderate', completionPercent: 90, mustHaveFacilities: h.must ?? [], routines: [],
  ...(h.pushchair ? { pushchair: h.pushchair } : {}),
} as FamilyProfile);

