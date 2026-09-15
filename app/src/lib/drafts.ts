/**
 * Osparade ändringar, sparade så länge appen lever.
 *
 * Ett enda lager för alla helskärmsvyer med osparat tillstånd (recept,
 * butiksdetalj …) i stället för en kopia per vy — samma lärdom som dubblett-
 * reglerna: en fråga, ett svar.
 *
 * Varför utkast och inte blockering av vägen ut: blockeringen var opålitlig i
 * PWA:n. expo-router äger historiken, så en avbruten navigering hann rendera
 * nästa skärm innan den ångrades, och ibland gick den igenom ändå. Här hindras
 * ingenting — ändringarna finns kvar när man kommer tillbaka, oavsett HUR man
 * lämnade.
 *
 * Ark (bottom-sheets) hanteras INTE här. De är lokalt tillstånd utan
 * navigering, så där är en fråga vid stängning pålitlig — se isDirty i
 * DraggableBottomSheet.
 *
 * Lagringen är i minnet med flit: AsyncStorage är en ny native-modul (nytt
 * bygge), och SecureStores 2 kB-gräns på Android spränger så fort ett recept
 * har en normallång tillagningsbeskrivning.
 */

export type MedTid<T> = T & { sparadVid: number };

export function createDraftStore<T extends object>() {
  const utkast = new Map<string, MedTid<T>>();
  return {
    spara(key: string, value: T): void {
      utkast.set(key, { ...value, sparadVid: Date.now() });
    },
    hamta(key: string): MedTid<T> | null {
      return utkast.get(key) ?? null;
    },
    slang(key: string): void {
      utkast.delete(key);
    },
    har(key: string): boolean {
      return utkast.has(key);
    },
  };
}

/** Butiksdetaljens osparade kategoriordning — exakt det som save() skickar. */
export interface StoreDraft {
  parentOrder: string[];
  expandedSubs: string[];
  subOrder: string[];
  customSubs: Record<string, string[]>;
  categoryMerge: Record<string, string>;
}

export const storeDrafts = createDraftStore<StoreDraft>();
