import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integrationstester använder en separat test-DB (.env.test). Setup-filen
    // laddar env och resetar tabellerna mellan varje test så att tester inte
    // läcker state till varandra. Pure helpers utan DB-beroende fungerar
    // fortfarande utan setup (setup:n laddar bara prisma vid behov).
    setupFiles: ['./src/test/setup.ts'],
    // En vitest-worker → en delad DB-connection. Annars konkurrerar parallella
    // tester om samma tabeller och resetar för varandra.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
