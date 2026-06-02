import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integrationstester använder en separat test-DB (.env.test). Setup-filen
    // laddar env och resetar tabellerna mellan varje test så att tester inte
    // läcker state till varandra. Pure helpers utan DB-beroende fungerar
    // fortfarande utan setup (setup:n laddar bara prisma vid behov).
    setupFiles: ['./src/test/setup.ts'],
    // En vitest-worker så test-filer inte konkurrerar om samma tabeller.
    fileParallelism: false,
  },
});
