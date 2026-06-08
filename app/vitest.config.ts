import { defineConfig } from 'vitest/config';

// Frontend-tester. Två sorter:
//  - Pure functions i src/lib + src/hooks (node-env, default).
//  - Render-tester för komponenter (RNTL): testfilen opt:ar in i jsdom via
//    docblocket `// @vitest-environment jsdom` högst upp. Aliaset nedan gör att
//    `react-native`-imports löses till `react-native-web` så komponenterna kan
//    renderas i jsdom (react-native-web är ren JS, ingen native-runtime krävs).
export default defineConfig({
  resolve: {
    alias: { 'react-native': 'react-native-web' },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    globals: false,
  },
});
