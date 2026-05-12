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
// (root node_modules has react@19.2.5 via react-dom, app pins 19.1.0 — two copies = broken hooks)
config.resolver.extraNodeModules = {
  react: path.resolve(projectRoot, 'node_modules', 'react'),
  'react-native': path.resolve(projectRoot, 'node_modules', 'react-native'),
};

// Prevent Metro from bundling Node.js-only packages hoisted to root node_modules by npm workspaces.
// @anthropic-ai/sdk (backend-only) uses Node.js built-ins unavailable in React Native.
const existingBlockList = config.resolver.blockList;
const anthropicBlock = /.*[\\/]node_modules[\\/]@anthropic-ai[\\/].*/;
config.resolver.blockList = existingBlockList
  ? [].concat(existingBlockList, anthropicBlock)
  : anthropicBlock;

module.exports = config;
