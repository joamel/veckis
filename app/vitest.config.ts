import { defineConfig } from 'vitest/config';

// Frontend-tester. Tills vidare bara pure functions i src/lib + src/hooks som
// inte beroender av React Native runtime. Render-tests för komponenter kan
// läggas till senare via react-native-testing-library + happy-dom/jsdom.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    globals: false,
  },
});
