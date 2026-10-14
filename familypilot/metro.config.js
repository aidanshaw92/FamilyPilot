// Metro's defaults treat .woff2 as source, so a WOFF2 font could not be required. The web build loads Inter as WOFF2
// (src/design-system/fonts.web.ts); this registers the extension as an asset, which is all it changes.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
if (!config.resolver.assetExts.includes('woff2')) config.resolver.assetExts.push('woff2');

module.exports = config;
