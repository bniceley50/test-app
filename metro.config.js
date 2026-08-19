const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite's web worker imports the SQLite WASM binary directly
// (`import wasm from './wa-sqlite/wa-sqlite.wasm'`) and passes it to the
// factory's locateFile as a URL. Metro only resolves file extensions it
// knows about, and `wasm` is not in the default assetExts, so register it
// here as an asset (resolved to a fetchable URL string).
if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

module.exports = config;
