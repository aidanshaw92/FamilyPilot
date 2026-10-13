import { useEffect, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

/**
 * How much larger than normal this person has asked text to be.
 *
 * On iOS and Android that is the system text size (Dynamic Type, "Font size"): React Native reports it as `fontScale`, which
 * is 1 at the default size and about 1.35 at the third-largest standard size ("xxxLarge") and up to about 3 at the largest
 * accessibility size. React Native Web always reports 1, whatever the browser is set to, so on the web it is read from the
 * browser's own text size: the root font size, 16 px by default and larger when the person has asked for larger text.
 */
export const LARGE_TEXT_SCALE = 1.35;
/** From here the screen stops trying to be a map with a card on it: the list is the way in, and its cards reflow to one column. */
export const isLargeText = (scale: number): boolean => scale >= LARGE_TEXT_SCALE;

/** The browser's text size as a multiple of its 16 px default, kept sane (no smaller than normal, no larger than the largest iOS size). */
export function scaleFromRootFontSize(rootPx: number): number {
  if (!Number.isFinite(rootPx) || rootPx <= 0) return 1;
  return Math.min(3.1, Math.max(1, rootPx / 16));
}

function readWebScale(): number {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return 1;
  return scaleFromRootFontSize(parseFloat(getComputedStyle(document.documentElement).fontSize));
}

export function useFontScale(): number {
  const { fontScale } = useWindowDimensions();
  const [web, setWeb] = useState(readWebScale);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const update = () => setWeb(readWebScale());
    update();
    // The root size changes with the browser's setting; a resize or zoom is when it is seen again.
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return Math.max(fontScale || 1, web);
}
