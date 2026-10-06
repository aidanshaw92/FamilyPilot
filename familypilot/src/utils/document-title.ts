/** What the browser tab and a screen reader's page announcement call each top-level screen. */
const TITLES: Array<[RegExp, string]> = [
  [/^\/welcome/, 'Welcome'],
  [/^\/(setup|onboarding)/, 'Set up your family'],
  [/^\/explore(\/|$)/, 'Explore London'],
  [/^\/trips(\/|$)/, 'Plans'],
  [/^\/saved(\/|$)/, 'Saved places'],
  [/^\/halfway(\/|$)/, 'Meet halfway'],
  [/^\/profile(\/|$)/, 'Your family'],
  [/^\/venue\//, 'Place details'],
  [/^\/restaurant\//, 'Restaurant details'],
  [/^\/plan(\/|$)/, 'Your plan'],
  [/^\/about/, 'About FamilyPilot'],
  [/^\/$/, 'Home'],
];

export function documentTitleFor(pathname: string): string {
  const match = TITLES.find(([pattern]) => pattern.test(pathname));
  return match ? `${match[1]} · FamilyPilot` : 'FamilyPilot';
}
