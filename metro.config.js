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
// create hidden `.NAME.<pid>.<uuid>.tmpdir` subdirs beside the file being
// written, and FallbackWatcher throws an uncaught ENOENT on them → kills
// `expo start` (lessons.md #13, fatal twice). Metro derives ONE watcher
// ignore-regex from `config.watcher.ignorePattern` → blockList. Tools /
// tasks / dist are never imported, so excluding them from the crawl+watch is
// safe and keeps the long-lived dev server immune to doc/tool edits. The
// `^` anchor is essential: react-native-web and friends keep their `dist/`
// under node_modules, and an unanchored match clobbered web resolution.
config.resolver = {
  ...(config.resolver || {}),
  blockList: [
    ...(config.resolver?.blockList || []),
    new RegExp('^(tools|tasks|dist)[/\\\\]'),
  ],
};

module.exports = config;
