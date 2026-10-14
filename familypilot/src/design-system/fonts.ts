/**
 * The typefaces the app draws with, as `useFonts` takes them. Native: the Inter TTFs, bundled with the app, so loading is local and the first screen
 * waits for them (behind the splash screen). The web build has its own version of this file (fonts.web.ts).
 *
 * Only the four weights a parent ever sees are loaded: Regular, Medium, Semi Bold and Bold. Extra Bold and Black stay in the type tokens but nothing
 * draws with them, so loading them cost every first visit two full font files for no word on any screen (src/__tests__/boot-performance.test.ts holds this).
 */
// Each weight from its own module: the package's main file re-exports all eighteen faces (and their italics), which puts every one of them in the bundle.
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';

export const fontSources = { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold };

/** Whether the first screen waits for the fonts. On a phone the fonts are in the app, so it does. */
export const blocksFirstRender = true;
