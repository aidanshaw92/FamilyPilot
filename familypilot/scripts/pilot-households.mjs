/** The test households used by the pilot journey checks. Names stay in this file: they never leave the browser. */
const adult = (id, name, dob) => ({ id, name, role: 'parent', dateOfBirth: dob, age: 36 });
const child = (id, name, dob, age, extra = {}) => ({ id, name, role: 'child', dateOfBirth: dob, age, ...extra });
const profile = (id, members, extra = {}) => ({
  id, parentName: members[0].name, members, homeLocation: 'Camden, London', homeLatitude: 51.539, homeLongitude: -0.142,
  budgetTier: 'moderate', maxDriveMinutes: 90, completionPercent: 80, vehicle: 'Volvo XC40', pushchair: 'Bugaboo Butterfly',
  travelCot: null, memberships: [], routines: [], mustHaveFacilities: [], ...extra,
});
export const FAMILIES = {
  'A-preschooler-and-baby': profile('fam-a', [adult('p1', 'Sarah', '1990-03-15'), adult('p2', 'Alex', '1991-02-02'), child('c1', 'Mia', '2022-06-10', 4), child('c2', 'Leo', '2026-02-12', 0)]),
  'B-baby-only': profile('fam-b', [adult('p1', 'Priya', '1992-05-05'), adult('p2', 'Sam', '1991-08-08'), child('c1', 'Noah', '2026-06-10', 0)]),
  'C-school-age': profile('fam-c', [adult('p1', 'Dana', '1985-01-01'), adult('p2', 'Chris', '1984-04-04'), child('c1', 'Cal', '2019-05-05', 7), child('c2', 'Dee', '2016-03-03', 10)], { pushchair: null }),
  'D-toddler-mobility-aid': profile('fam-d', [adult('p1', 'Jo', '1988-09-09'), child('c1', 'Ivy', '2024-04-10', 2, { mobility: ['mobility-aid'] })], { mustHaveFacilities: ['toilets'], pushchair: null }),
};

