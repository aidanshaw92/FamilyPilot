/** Bundled raster images: Metro resolves an import to an asset reference, which `expo-image` accepts as a source. */
declare module '*.jpg' {
  const source: import('expo-image').ImageSource;
  export default source;
}
