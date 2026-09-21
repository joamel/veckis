import { PrismaClient } from '@prisma/client';

/**
 * Frågelogg är AVSTÄNGD som standard, även i utveckling.
 *
 * Den låg tidigare på i hela utvecklingsläget, vilket dränkte utskriften i
 * städskripten: de importerar bibliotek som drar in den här klienten, och
 * varje SQL-fråga hamnade mitt i listan man skulle läsa. Rapporten är själva
 * poängen med de skripten.
 *
 * Sätt PRISMA_QUERY_LOG=1 när du faktiskt vill se frågorna.
 */
export const prisma = new PrismaClient({
  log: process.env.PRISMA_QUERY_LOG === '1' ? ['query', 'warn', 'error'] : ['warn', 'error'],
});
