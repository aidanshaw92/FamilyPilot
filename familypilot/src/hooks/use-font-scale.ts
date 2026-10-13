import { useEffect, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

import { LARGE_TEXT_SCALE, isLargeText, scaleFromRootFontSize } from '@/src/utils/font-scale';

export { LARGE_TEXT_SCALE, isLargeText, scaleFromRootFontSize };

/**
 * The system text size on iOS and Android (Dynamic Type, "Font size"): React Native reports it as `fontScale`, 1 at the default size,
 * about 1.35 at "xxxLarge" and up to about 3 at the largest accessibility size. React Native Web always reports 1, so on the web
 * it is read from the browser's own text size: the root font size, 16 px by default and larger when the person has asked for more.
 */
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
