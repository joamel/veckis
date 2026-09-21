import type { StoreCategory } from '@veckis/shared';

/**
 * Vad som ska skrivas till en basvara — och vad som INTE ska röras.
 *
 * Bakgrund: appen anropar POST /api/staples vid varje tillägg av en vara, inte
 * bara när någon medvetet ställer in den. Det anropet bär ingen kategori när
 * användaren inte valt någon. Tolkades det som "kör klassaren" skrevs
 * gissningen in över ett val som gjorts för hand, och subkategorin nollställdes
 * på köpet. Utifrån såg det ut som att kategorin vägrade ändra sig medan
 * enheten lydde direkt — enheten klarade sig bara för att `undefined` lämnas
 * ifred av Prisma.
 *
 * Regeln: en gissning får fylla ett tomt fält, aldrig skriva över ett val.
 */

export type Angivet = {
  /** Som anroparen skickade den. undefined = inget val gjort. */
  category?: StoreCategory;
  /** undefined = inget val gjort. null = uttryckligen ingen subkategori. */
  subCategory?: string | null;
};

export type Basvaruskrivning = {
  /** Anroparen valde en riktig kategori ('other' är inget val). */
  valdeKategori: boolean;
  /** Anroparen sa något om subkategorin, även om det var null. */
  valdeSub: boolean;
  /** Fälten för en NY basvara — här är klassarens gissning rätt svar, för det
   *  finns inget tidigare val att förstöra. */
  skapa: { category: StoreCategory; subCategory: string | null };
  /** Fälten för en BEFINTLIG basvara — bara det som faktiskt valts. */
  uppdatera: { category?: StoreCategory; subCategory?: string | null };
  /** Om varor som redan ligger i öppna listor får flyttas. Bara ett val får
   *  göra det; en gissning som flyttar varor ser ut som att listan lever
   *  sitt eget liv mitt i handlingen. */
  fårFlyttaVaror: boolean;
};

export function basvaruskrivning(angivet: Angivet, klassadKategori: StoreCategory): Basvaruskrivning {
  const valdeKategori = angivet.category !== undefined && angivet.category !== 'other';
  const valdeSub = angivet.subCategory !== undefined;

  return {
    valdeKategori,
    valdeSub,
    skapa: {
      category: valdeKategori ? angivet.category! : klassadKategori,
      subCategory: angivet.subCategory ?? null,
    },
    uppdatera: {
      ...(valdeKategori ? { category: angivet.category! } : {}),
      ...(valdeSub ? { subCategory: angivet.subCategory ?? null } : {}),
    },
    fårFlyttaVaror: valdeKategori || valdeSub,
  };
}
