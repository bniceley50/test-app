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

// Keep Metro's file watcher away from volatile dirs: git's Windows COW saves
// create hidden `.NAME.<pid>.<uuid>.tmpdir` subdirectories beside the file
// being written, and FallbackWatcher throws an uncaught ENOENT on those,
// which KILLS `expo start` (lessons.md #13 — two fatal crashes this project).
// This metro version derives the single ignore regex (used for BOTH crawl and
// watch — see metro-file-map/src/Index.js ignoreForCrawl + ignorePatternForWatch)
// from `resolver.blockList` (metro createFileMap.getIgnorePattern). Block the
// three volatile project dirs there: tools/ (node CDP scripts), tasks/ (docs +
// evidence PNGs), dist/ (export output). None of them are imported by app
// source, so a crawler exception is safe too.
const VOLATILE_DIRS = /(^|[/\\])(tools|tasks|dist)[/\\]/;
config.resolver = {
  ...(config.resolver || {}),
  blockList: [...(config.resolver?.blockList || []), VOLATILE_DIRS],
};

module.exports = config;
