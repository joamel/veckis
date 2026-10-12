/**
 * Osparade ändringar — kvar även när appen startas om.
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
 * Lagring: minnet är det man läser från (synkront, så vyerna aldrig väntar).
 * Varje ändring skrivs dessutom vidare till en DraftBackend som appens rot
 * registrerar (draftBackend.ts: en fil i appens dokumentmapp, localStorage på
 * webben), och läses in därifrån första gången ett lager används. Utan
 * registrerad backend — i tester — lever utkasten bara i minnet. Android kan
 * stänga en app i bakgrunden för att frigöra minne; det var där utkast
 * försvann utan att man själv stängt något.
 */

export type MedTid<T> = T & { sparadVid: number };

/** Var utkasten bor mellan körningar. Synkron: läses en gång, skrivs fördröjt. */
export interface DraftBackend {
  read(): string | null;
  write(text: string): void;
}

/** Ett utkast som legat orört så länge är inte längre något man saknar. */
export const DRAFT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const WRITE_DELAY_MS = 400;

type Doc = Record<string, Record<string, MedTid<object>>>;

let backend: DraftBackend | null = null;
let doc: Doc | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;
const resets: Array<() => void> = [];

/** Anropas en gång från appens rot. */
export function setDraftBackend(b: DraftBackend | null): void {
  backend = b;
  doc = null;
}

function loadDoc(): Doc {
  if (doc) return doc;
  doc = {};
  if (!backend) return doc;
  try {
    const text = backend.read();
    const parsed = text ? JSON.parse(text) : null;
    if (parsed && typeof parsed === 'object') doc = parsed as Doc;
  } catch {
    doc = {}; // trasig fil — börja om hellre än att krascha
  }
  return doc;
}

function scheduleWrite(): void {
  if (!backend || writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    try { backend?.write(JSON.stringify(doc ?? {})); } catch { /* best effort */ }
  }, WRITE_DELAY_MS);
}

/** Tömmer alla utkast, i minnet och på disk — vid utloggning. */
export function clearAllDrafts(): void {
  resets.forEach(r => r());
  doc = {};
  if (backend) {
    if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
    try { backend.write('{}'); } catch { /* best effort */ }
  }
}

/**
 * Ett lager per vy. `namespace` håller isär lagren på disk; utan det (tester)
 * sparas inget utanför minnet.
 */
export function createDraftStore<T extends object>(namespace?: string) {
  const utkast = new Map<string, MedTid<T>>();
  let hydrated = false;

  const persisted = (): Record<string, MedTid<object>> | null => {
    if (!namespace || !backend) return null;
    const d = loadDoc();
    return (d[namespace] ??= {});
  };

  // Läs in från disk första gången lagret används; släng gamla utkast.
  const hydrate = () => {
    if (hydrated) return;
    hydrated = true;
    const p = persisted();
    if (!p) return;
    const gräns = Date.now() - DRAFT_MAX_AGE_MS;
    let ändrat = false;
    for (const [key, value] of Object.entries(p)) {
      if (!value || typeof value.sparadVid !== 'number' || value.sparadVid < gräns) {
        delete p[key];
        ändrat = true;
        continue;
      }
      utkast.set(key, value as MedTid<T>);
    }
    if (ändrat) scheduleWrite();
  };

  resets.push(() => { utkast.clear(); hydrated = true; });

  return {
    spara(key: string, value: T): void {
      hydrate();
      const v = { ...value, sparadVid: Date.now() };
      utkast.set(key, v);
      const p = persisted();
      if (p) { p[key] = v; scheduleWrite(); }
    },
    hamta(key: string): MedTid<T> | null {
      hydrate();
      return utkast.get(key) ?? null;
    },
    slang(key: string): void {
      hydrate();
      utkast.delete(key);
      const p = persisted();
      if (p && key in p) { delete p[key]; scheduleWrite(); }
    },
    har(key: string): boolean {
      hydrate();
      return utkast.has(key);
    },
  };
}

/** Butiksdetaljens osparade kategoriordning — exakt det som save() skickar. */
export interface StoreDraft {
  parentOrder: string[];
  expandedSubs: string[];
  subOrder: string[];
  categoryMerge: Record<string, string>;
  /** Saknas i utkast sparade före 2026-09-30. */
  categoryLabels?: Record<string, string>;
}

export const storeDrafts = createDraftStore<StoreDraft>('butik');
