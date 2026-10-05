import { usePathname } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

/** What the browser tab and a screen reader's page announcement call each top-level screen. */
const TITLES: Array<[RegExp, string]> = [
  [/^\/welcome/, 'Welcome'],
  [/^\/(setup|onboarding)/, 'Set up your family'],
  [/^\/explore/, 'Explore London'],
  [/^\/trips/, 'Plans'],
  [/^\/saved/, 'Saved places'],
  [/^\/profile/, 'Your family'],
  [/^\/venue\//, 'Place details'],
  [/^\/restaurant\//, 'Restaurant details'],
  [/^\/plan/, 'Your plan'],
  [/^\/about/, 'About FamilyPilot'],
  [/^\/$/, 'Home'],
];

export function documentTitleFor(pathname: string): string {
  const match = TITLES.find(([pattern]) => pattern.test(pathname));
  return match ? `${match[1]} · FamilyPilot` : 'FamilyPilot';
}

/**
 * Keeps the web page's `<title>` in step with the screen. Every page used to have an empty one, which
 * is the first thing a screen reader announces and what a browser tab and history entry are named by.
 * A screen with a better name (a venue's own) may set `document.title` itself afterwards.
 */
export function useDocumentTitle(): void {
  const pathname = usePathname();
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.title = documentTitleFor(pathname);
  }, [pathname]);
}
