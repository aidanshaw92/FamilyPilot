/**
 * Single source of truth for deterministic constraint parsing.
 *
 * The implementation lives under the app so the Expo bundler can reach it; the server reaches it
 * from here. Two copies of these rules is exactly how the offline path came to disagree with the
 * online one, so this file deliberately holds no logic of its own.
 */
module.exports = require('../../familypilot/src/services/recommendation/explicit-constraint-parser.js');
