import { usePathname } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { documentTitleFor } from '@/src/utils/document-title';

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

/** A screen with a better name than its route's (a venue's own) sets it here, after the route's. */
export function useNamedDocumentTitle(name: string | undefined): void {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || !name) return;
    document.title = `${name} · FamilyPilot`;
  }, [name]);
}
