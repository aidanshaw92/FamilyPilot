/**
 * The web build's typefaces: the same four Inter weights as the native app, cut down to the Latin letters, numbers and punctuation the app writes
 * (about 19 KB each as WOFF2, against 340 KB each as TTF), and the first screen does NOT wait for them. A parent on a slow connection sees the page in
 * the system font at once and the text settles into Inter when the files arrive, instead of a blank page until two megabytes of fonts have come down.
 * A character outside that range (or a glyph the subset lacks) is drawn by the system font, which is what the browser does for any missing glyph.
 *
 * Source, licence and the command that made the files: assets/fonts/web/README.md.
 */
export const fontSources = {
  Inter_400Regular: require('../../assets/fonts/web/Inter_400Regular-latin.woff2'),
  Inter_500Medium: require('../../assets/fonts/web/Inter_500Medium-latin.woff2'),
  Inter_600SemiBold: require('../../assets/fonts/web/Inter_600SemiBold-latin.woff2'),
  Inter_700Bold: require('../../assets/fonts/web/Inter_700Bold-latin.woff2'),
};

export const blocksFirstRender = false;
