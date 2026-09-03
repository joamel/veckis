const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [
  ...(config.watchFolders ?? []),
  path.resolve(monorepoRoot, 'shared'),
];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Force a single React instance across the monorepo to prevent dispatcher mismatch
// (npm workspaces hoisting can leave a stray react copy at either level depending on
// what else is installed — two copies = broken hooks, "Cannot read property 'useEffect'
// of null"). Resolve via require.resolve instead of a hardcoded path: npm's hoisting
// decision changes between installs (root vs app/node_modules) whenever the dependency
// tree shifts, so a fixed path silently pointed at a directory that stopped existing
// the moment a clean install re-hoisted these to root — Metro fell through to a broken
// module reference and every OTA update built afterwards crashed the app at launch.
config.resolver.extraNodeModules = {
  react: path.dirname(require.resolve('react/package.json', { paths: [projectRoot] })),
  'react-native': path.dirname(require.resolve('react-native/package.json', { paths: [projectRoot] })),
};

// Prevent Metro from bundling Node.js-only packages hoisted to root node_modules by npm workspaces.
// @anthropic-ai/sdk (backend-only) uses Node.js built-ins unavailable in React Native.
const existingBlockList = config.resolver.blockList;
const anthropicBlock = /.*[\\/]node_modules[\\/]@anthropic-ai[\\/].*/;
config.resolver.blockList = existingBlockList
  ? [].concat(existingBlockList, anthropicBlock)
  : anthropicBlock;

module.exports = config;
