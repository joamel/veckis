import { useMemo, useRef } from 'react';
import { useAuth } from '@clerk/expo';
import type {
  Household,
  HouseholdMember,
  InviteCode,
  ShoppingList,
  ShoppingItem,
  Store,
  StoreCategory,
  WeekDay,
  Recipe,
  RecipeIngredient,
  WeekMenuItem,
  MealType,
  StapleItem,
  BankStore,
} from '@veckis/shared';
import { trackBackendRequest } from '../lib/backendWakeup';
import { reportClientError } from '../lib/errorReport';
import { Image } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { common } from '../lib/svenska';
import { passaInom, type Resize } from '../lib/bildstorlek';

/**
 * Läser bildens mått och räknar ut hur den ska skalas. Själva uträkningen bor
 * i bildstorlek.ts där den går att testa; här är bara måtthämtningen, som
 * kräver en riktig bild. Går måtten inte att läsa faller vi tillbaka på att
 * begränsa bredden — sämre gissning, men aldrig större än max.
 */
async function resizeFor(uri: string, max: number): Promise<Resize> {
  const mått = await new Promise<{ w: number; h: number } | null>(resolve => {
    Image.getSize(uri, (w, h) => resolve({ w, h }), () => resolve(null));
  });
  return mått ? passaInom(mått.w, mått.h, max) : { width: max };
}

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

// Modul-nivå (delad mellan alla useApiClient()-instanser) — se request() nedan.
const inFlightMutations = new Map<string, Promise<unknown>>();

function makeIdempotencyKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export type { StoreCategory, WeekDay };

/**
 * Error thrown by the API client. Distinguishes a failed network request
 * (server unreachable / offline) from an HTTP error response so callers can
 * show a meaningful message when an optimistic update has to be rolled back.
 */
export class ApiError extends Error {
  readonly status: number | null;
  readonly isNetworkError: boolean;

  constructor(message: string, status: number | null, isNetworkError: boolean) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.isNetworkError = isNetworkError;
  }
}

/**
 * Picks a user-facing Swedish message for a caught error. Network failures get
 * a connectivity hint; everything else falls back to the caller's context
 * message so the toast still tells the user *what* failed.
 */
export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.isNetworkError) {
    return 'Ingen anslutning till servern – försök igen';
  }
  return fallback;
}

export type RecipeWithIngredients = Recipe & { ingredients: RecipeIngredient[] };
export type WeekMenuItemWithRecipe = WeekMenuItem & { recipe: RecipeWithIngredients };

export interface NotificationPreferences {
  listCleared: boolean;
  newMember: boolean;
  shopperClaimed: boolean;
  shopperItemAdded: boolean;
}

export interface MenuTemplate {
  id: string;
  householdId: string;
  name: string;
  createdAt: string;
  items: { id: string; recipeId: string; day: WeekDay | null; recipe: { id: string; title: string } }[];
}

export type HouseholdWithMembers = Household & { members: HouseholdMember[]; stores: Store[] };

export interface AuditLogEntry {
  id: string;
  householdId: string | null;
  actorClerkUserId: string;
  actorName: string | null;
  action: string; // 'household.update' | 'household.delete' | 'member.role_change' | 'member.remove'
  targetType: string | null;
  targetId: string | null;
  targetName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}
export interface AdminVoteRow {
  name: string;
  curated: { category: string; subCategory: string | null };
  households: number;
  disagreeing: number;
  categories: { category: string; households: number }[];
  subCategories: { subCategory: string; households: number }[];
  curatedByAdmin: boolean;
}
export interface AdminClassifyReport {
  name: string;
  category: string;
  subCategory: string | null;
  source: 'admin' | 'torkad' | 'undantag' | 'underkategori' | 'lagrat' | 'nyckelord' | 'ingen';
  override: { category: string; subCategory: string | null; updatedAt: string } | null;
  households: number;
  choices: { category: string; households: number }[];
  openItems: number;
}
export interface AdminCurationImpact {
  name: string;
  before: { category: string; subCategory: string | null };
  after: { category: string; subCategory: string | null };
  guessedStaples: number;
  chosenStaples: number;
  chosenDiffering: number;
  itemsToMove: number;
}
export type AdminNameSuggestion =
  | { name: string; weight: number; action: 'delete'; reason: string }
  | { name: string; weight: number; action: 'rename'; to: string; reason: string };
export interface AdminJob { id: string; title: string; description: string; usesAi: boolean }
export interface AdminJobRow { table: string; key: string; label: string; from: string; to: string; name?: string }
export interface AdminNameImpact { name: string; aliasRows: number; staples: number; households: number }
export interface ClientErrorEntry {
  id: number;
  name: string;
  message: string;
  stack?: string | null;
  platform?: string;
  appVersion?: string;
  context?: Record<string, unknown>;
  at?: string;
  receivedAt: string;
}

/** En vara ur en importerad lista, innan den lagts till. */
export type ImportVara = {
  name: string;
  quantity: number | null;
  unit: string | null;
  /** Namnet som stod i listan, när matchningen bytte ut det. */
  original?: string | null;
  /** Varför namnet byttes: hushållets egen basvara, eller kanonisering. */
  källa?: 'basvara' | 'kanonisering' | null;
  /** Antal rader varan stod på i källan (>1 visas i granskningen). */
  antalRader?: number;
};

export type MembershipWithHousehold = HouseholdMember & { household: Household };
export type ShoppingItemWithRecipe = ShoppingItem & { recipe: { id: string; title: string } | null };
export type ShoppingListWithItems = ShoppingList & { items: ShoppingItemWithRecipe[]; store: Store | null };

// Utan tak väntar RN:s fetch på en död anslutning (t.ex. efter dagar i
// bakgrunden) för evigt: anropet varken lyckas eller kastar, så retry-logiken
// nedan körs aldrig och skärmen snurrar för alltid.
const REQUEST_TIMEOUT_MS = 15000;
const TOKEN_TIMEOUT_MS = 12000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
}

export function useApiClient() {
  const { getToken } = useAuth();
  // useAuth().getToken är inte garanterat referens-stabil mellan renders —
  // en ref läser alltid senaste versionen utan att den behöver stå i
  // useMemo-beroendena nedan (som annars gör klienten instabil igen).
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  async function performRequest<T>(path: string, options: RequestInit = {}, attempt = 0): Promise<T> {
    // Inloggningstoken gäller bara en kort stund och förnyas via nätet. Utan
    // täckning kan förnyelsen kasta — och det är ett nätverksfel, inte en
    // utloggning. Som vanligt fel rullades en bock i butiken tillbaka med en
    // felruta i stället för att köas till när nätet kom tillbaka.
    let token: string | null;
    try {
      token = await withTimeout(getTokenRef.current(), TOKEN_TIMEOUT_MS);
    } catch {
      throw new ApiError('Network request failed', null, true);
    }
    if (!token) {
      // DIAG: bekräftar om "kunde inte ladda X"-vågen orsakas av att getToken()
      // inte ger en session-JWT alls (skulle förklara varför inget når Railway).
      reportClientError('DIAG: getToken() gav ingen token i API-klienten', { path });
      throw new ApiError('Du är utloggad. Logga in igen för att fortsätta.', 401, false);
    }
    const url = `${BASE_URL}${path}`;
    // Kallstart-retry: gratis-hosting spinner ner (Render) och Neon-DB:n
    // autosuspendar (vaknar med 57P01 → 5xx) med backoff. GET/HEAD är alltid
    // säkra att retry:a. Muterande anrop retry:as också (samma "network
    // request failed" hände deterministiskt varje gång på riktiga enheter —
    // se DIAG-fyndet 2026-09-05), men bara tack vare Idempotency-Key-headern
    // (satt i request() nedan) som gör en eventuell serverside-dubblett
    // ofarlig: backend spelar upp samma svar istället för att köra igen.
    const method = (options.method ?? 'GET').toUpperCase();
    const canRetry = attempt < 3;
    const backoff = () => new Promise(r => setTimeout(r, [1500, 4000, 9000][attempt] ?? 9000));
    let res: Response;
    const startedAt = Date.now();
    const abortController = new AbortController();
    const abortTimer = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS);
    try {
      // trackBackendRequest visar "Vaknar…"-indikatorn om fetch:en dröjer >3s
      // (kallstart) och släcker den när backend svarar. Utan detta retry:ade
      // klienten tyst utan feedback → appen såg trasig ut under uppvaknandet.
      res = await trackBackendRequest(fetch(url, {
        signal: abortController.signal,
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...options.headers,
        },
      }));
    } catch (err) {
      clearTimeout(abortTimer);
      // fetch rejects (rather than resolving with !ok) when the request never
      // reached the server: no connectivity, DNS failure, server down, etc.
      const elapsedMs = Date.now() - startedAt;
      reportClientError('DIAG: fetch() reject', {
        path, method, attempt, elapsedMs,
        message: err instanceof Error ? err.message : String(err),
      });
      if (canRetry) {
        // Snabb avvisning (<1s) = troligen en död/återanvänd anslutning i
        // nätverkspoolen (bekräftat 2026-09-06: 128ms, servern hann ändå
        // lyckas) — då är en ny anslutning nästan alltid klar direkt, ingen
        // anledning att vänta 1,5–9s som om backend sov. Den längre
        // schemat (1500/4000/9000) sparas för fall där fetch() faktiskt
        // hann dröja, vilket bättre matchar en genuint långsam/uppvaknande
        // backend.
        const shortBackoff = elapsedMs < 1000;
        const ms = shortBackoff ? [300, 800, 2000][attempt] ?? 2000 : [1500, 4000, 9000][attempt] ?? 9000;
        await new Promise(r => setTimeout(r, ms));
        return performRequest<T>(path, options, attempt + 1);
      }
      throw new ApiError('Network request failed', null, true);
    }
    clearTimeout(abortTimer);

    if (!res.ok) {
      // 5xx = servern uppe men beroende (oftast DB:n) vaknar → retry:a idempotenta.
      if (res.status >= 500 && canRetry) { await backoff(); return performRequest<T>(path, options, attempt + 1); }
      // 401 = auth bruten, sessionen gick förlorad. Token kan ha förfallit eller
      // Clerk-sessionen uppgraderades åt något sätt. Logga ut för att tvinga
      // appen att uppdatera från Clerk på nytt.
      if (res.status === 401) {
        throw new ApiError('Din session gick förlorad. Logga in igen.', 401, false);
      }
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(err.error ?? `HTTP ${res.status}`, res.status, false);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  // Global (modul-nivå) deduplicering av muterande anrop (POST/PATCH/DELETE).
  // Flera skärmar skyddar bara dubbeltryck med React-state (`creating`), som
  // kan släpa ett par renders — ett snabbt andra tryck (Enter + knapp, eller
  // bara ett snabbt dubbelklick) hann då smita igenom och skapa dubbletter
  // (bekräftat: dubbla lyckade POST /api/stores och /api/recipes några
  // sekunder isär i produktionsloggarna). Detta skyddar ALLA muterande anrop
  // i hela appen på ett ställe, i stället för att lappa varje skärm för sig.
  function request<T>(path: string, options: RequestInit = {}, attempt = 0): Promise<T> {
    const method = (options.method ?? 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD') return performRequest<T>(path, options, attempt);

    const dedupeKey = `${method}:${path}:${typeof options.body === 'string' ? options.body : ''}`;
    const existing = inFlightMutations.get(dedupeKey);
    if (existing) return existing as Promise<T>;

    // Samma nyckel återanvänds av performRequest:s interna nätverks-retry
    // (options-referensen ärvs oförändrad ner i rekursionen) — backend
    // (idempotencyMiddleware) spelar upp samma svar om en retry råkar nå
    // fram efter att ett tidigare försök redan lyckats server-side.
    const optionsWithIdempotency: RequestInit = {
      ...options,
      headers: { 'Idempotency-Key': makeIdempotencyKey(), ...options.headers },
    };

    const promise = performRequest<T>(path, optionsWithIdempotency, attempt).finally(() => {
      if (inFlightMutations.get(dedupeKey) === promise) inFlightMutations.delete(dedupeKey);
    });
    inFlightMutations.set(dedupeKey, promise);
    return promise;
  }

  // Memoiserat — annars är returvärdet ett nytt objekt vid varje render
  // (useAuth().getToken är stabil), vilket gör klienten oanvändbar som
  // useCallback/useEffect-dependency: varje beroende komponent (t.ex.
  // GettingStartedOverlay) skulle då loopa om sig själv i oändlighet och
  // spränga backendens rate limit (200 req/15 min) på sekunder — vilket är
  // exakt vad som orsakade "kunde inte ladda X" på nya/ofärdiga konton.
  return useMemo(() => ({
    // Households
    createHousehold: (name: string, displayName?: string) =>
      request<HouseholdWithMembers>('/api/households', {
        method: 'POST',
        body: JSON.stringify({ name, displayName }),
      }),

    getMyHouseholds: () =>
      request<MembershipWithHousehold[]>('/api/households/me'),

    getHousehold: (householdId: string) =>
      request<HouseholdWithMembers>(`/api/households/${householdId}`),

    setPinnedRecipeTags: (householdId: string, tags: string[]) =>
      request<Household>(`/api/households/${householdId}/pinned-tags`, {
        method: 'PUT',
        body: JSON.stringify({ tags }),
      }),

    updateHousehold: (householdId: string, name: string) =>
      request<Household>(`/api/households/${householdId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      }),

    deleteHousehold: (householdId: string) =>
      request<void>(`/api/households/${householdId}`, { method: 'DELETE' }),

    joinHousehold: (code: string, displayName?: string) =>
      request<HouseholdMember>('/api/households/join', {
        method: 'POST',
        body: JSON.stringify({ code, displayName }),
      }),

    createInvite: (householdId: string) =>
      request<InviteCode>(`/api/households/${householdId}/invite`, { method: 'POST' }),

    /** Användaren lämnar hushållet själv. Sista admin blockeras med 400. */
    leaveHousehold: (householdId: string) =>
      request<void>(`/api/households/${householdId}/leave`, { method: 'POST' }),

    /** Raderar det inloggade Clerk-kontot + städar alla medlemskap (backend). */
    deleteAccount: () =>
      request<void>('/api/account', { method: 'DELETE' }),

    /** Audit-events för hushållet, nyaste först. Admin-only på backend.
     *  before-cursor: skickar in createdAt från sista raden för "ladda fler". */
    getAuditLog: (householdId: string, opts: { limit?: number; before?: string } = {}) => {
      const params = new URLSearchParams();
      if (opts.limit) params.set('limit', String(opts.limit));
      if (opts.before) params.set('before', opts.before);
      const qs = params.toString();
      return request<AuditLogEntry[]>(`/api/households/${householdId}/audit${qs ? '?' + qs : ''}`);
    },

    exportHouseholdData: async (householdId: string): Promise<string> => {
      const token = await getTokenRef.current();
      const res = await fetch(`${BASE_URL}/api/households/${householdId}/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new ApiError(err.error ?? `HTTP ${res.status}`, res.status, false);
      }
      return res.text();
    },

    removeMember: (householdId: string, memberId: string) =>
      request<void>(`/api/households/${householdId}/members/${memberId}`, { method: 'DELETE' }),

    updateMember: (householdId: string, memberId: string, data: { displayName?: string; role?: 'admin' | 'member' }) =>
      request<HouseholdMember>(`/api/households/${householdId}/members/${memberId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    // Shopping
    getShoppingLists: (householdId: string) =>
      request<ShoppingListWithItems[]>(`/api/shopping/lists?householdId=${householdId}`),

    getShoppingList: (listId: string) =>
      request<ShoppingListWithItems>(`/api/shopping/lists/${listId}`),

    createShoppingList: (data: { householdId: string; name: string; emoji?: string | null; storeId?: string; isShared?: boolean }) =>
      request<ShoppingListWithItems>('/api/shopping/lists', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    completeShoppingList: (listId: string) =>
      request<ShoppingList>(`/api/shopping/lists/${listId}/complete`, { method: 'PATCH' }),

    /** "Jag handlar"-presence: sätt memberId för att claima, null för att släppa. */
    setListShopper: (listId: string, memberId: string | null) =>
      request<{ listId: string; memberId: string | null; since: string | null }>(
        `/api/shopping/lists/${listId}/shopper`,
        { method: 'PATCH', body: JSON.stringify({ memberId }) },
      ),

    clearShoppingList: (listId: string) =>
      request<void>(`/api/shopping/lists/${listId}/items`, { method: 'DELETE' }),

    deleteShoppingList: (listId: string) =>
      request<void>(`/api/shopping/lists/${listId}`, { method: 'DELETE' }),

    addShoppingItem: (listId: string, data: { name: string; quantity?: number; unit?: string; category?: StoreCategory; subCategory?: string | null; note?: string }) =>
      request<ShoppingItem>(`/api/shopping/lists/${listId}/items`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    mergeShoppingItems: (data: { sourceIds: string[]; name: string; quantity: number; unit?: string | null; category: string }) =>
      request<ShoppingItem>('/api/shopping/items/merge', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    // Smart förslag för dubblettdialogen (förpacknings-ekvivalenser, AI-lärd).
    getMergeSuggestion: (data: { itemIds: string[] }) =>
      request<{ suggestion: { quantity: number; unit: string; basis: 'exact' | 'equivalence' } | null }>(
        '/api/shopping/merge-suggestion',
        { method: 'POST', body: JSON.stringify(data) },
      ),

    updateShoppingItem: (itemId: string, data: Partial<Pick<ShoppingItem, 'name' | 'quantity' | 'unit' | 'category' | 'subCategory' | 'note'>>) =>
      request<ShoppingItem>(`/api/shopping/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    // at: när bocken gjordes (offlinekön skickar samlat senare). bulk:
    // "markera alla i kategorin" — ingen väg genom butiken. Båda används för
    // att lära sig butikens ordning.
    checkShoppingItem: (itemId: string, checked: boolean, opts: { at?: string; bulk?: boolean } = {}) =>
      request<ShoppingItem>(`/api/shopping/items/${itemId}/check`, {
        method: 'PATCH',
        body: JSON.stringify({ checked, ...opts }),
      }),

    deleteShoppingItem: (itemId: string) =>
      request<void>(`/api/shopping/items/${itemId}`, { method: 'DELETE' }),

    // Stores
    getStores: (householdId: string) =>
      request<Store[]>(`/api/stores?householdId=${householdId}`),

    // Butiksbanken. Position går före postnummer; attribution ska visas.
    searchStoreBank: (p: { q?: string; postcode?: string; lat?: number; lon?: number }) => {
      const qs = new URLSearchParams();
      if (p.q) qs.set('q', p.q);
      if (p.postcode) qs.set('postcode', p.postcode);
      // Avrundad till ~1 km innan den lämnar telefonen: närmaste butik kräver
      // inte mer, och så är positionen ungefärlig även i trafiken.
      const ungefär = (v: number) => String(Math.round(v * 100) / 100);
      if (p.lat != null && p.lon != null) { qs.set('lat', ungefär(p.lat)); qs.set('lon', ungefär(p.lon)); }
      return request<{ stores: BankStore[]; attribution: string }>(`/api/stores/bank?${qs.toString()}`);
    },

    createStore: (data: { householdId: string; name: string; sharedStoreId?: string | null; categoryOrder?: StoreCategory[]; customCategories?: string[]; expandedSubs?: string[]; subOrder?: string[]; parentOrder?: string[]; categoryMerge?: Record<string, string>; categoryLabels?: Record<string, string> }) =>
      request<Store>('/api/stores', { method: 'POST', body: JSON.stringify(data) }),

    // Föreslagen sektionsordning ur hushållets bockar i butiken (steg 4).
    getStoreOrderSuggestion: (storeId: string) =>
      request<{ trips: number; order: string[]; changed: boolean; known: number; ownTrips: number; otherHouseholds: number }>(`/api/stores/${storeId}/order-suggestion`),

    updateStore: (storeId: string, data: { name?: string; sharedStoreId?: string | null; categoryOrder?: StoreCategory[]; customCategories?: string[]; expandedSubs?: string[]; subOrder?: string[]; parentOrder?: string[]; categoryMerge?: Record<string, string>; categoryLabels?: Record<string, string> }) =>
      request<Store>(`/api/stores/${storeId}`, { method: 'PATCH', body: JSON.stringify(data) }),

    deleteStore: (storeId: string) =>
      request<void>(`/api/stores/${storeId}`, { method: 'DELETE' }),

    // Recipes
    getRecipes: (householdId: string) =>
      request<RecipeWithIngredients[]>(`/api/recipes?householdId=${householdId}`),

    getRecipe: (recipeId: string) =>
      request<RecipeWithIngredients>(`/api/recipes/${recipeId}`),

    createRecipe: (data: { householdId: string; title: string; description?: string | null; instructions?: string | null; sourceUrl?: string | null; source?: 'manual' | 'ai_paste' | 'url_import'; imageUrl?: string | null; servings?: number; cookMinutes?: number | null; ingredients?: Array<{ name: string; quantity?: number | null; unit?: string | null; category?: StoreCategory; originalName?: string | null }>; tags?: string[] }) =>
      request<RecipeWithIngredients>('/api/recipes', { method: 'POST', body: JSON.stringify(data) }),

    updateRecipe: (recipeId: string, data: { title?: string; description?: string | null; instructions?: string | null; imageUrl?: string | null; imageFocusX?: number | null; imageFocusY?: number | null; imageZoom?: number | null; servings?: number; cookMinutes?: number | null; ingredients?: Array<{ name: string; quantity?: number | null; unit?: string | null; category?: StoreCategory; originalName?: string | null }>; tags?: string[] }) =>
      request<RecipeWithIngredients>(`/api/recipes/${recipeId}`, { method: 'PATCH', body: JSON.stringify(data) }),

    deleteRecipe: (recipeId: string) =>
      request<void>(`/api/recipes/${recipeId}`, { method: 'DELETE' }),

    uploadRecipeImage: async (recipeId: string, fileUri: string, mimeType = 'image/jpeg'): Promise<RecipeWithIngredients> => {
      const form = new FormData();
      // RN's FormData accepts the file blob descriptor object directly.
      form.append('image', { uri: fileUri, name: 'recipe.jpg', type: mimeType } as unknown as Blob);
      const token = await getTokenRef.current();
      const res = await fetch(`${BASE_URL}/api/recipes/${recipeId}/image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }, // let fetch set the multipart boundary
        body: form,
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const j = await res.json(); msg = (j as { error?: string }).error ?? msg; } catch { /* ignore */ }
        throw new Error(msg);
      }
      return res.json() as Promise<RecipeWithIngredients>;
    },
    scrapeRecipe: (url: string) =>
      request<{ title: string; description: string | null; imageUrl: string | null; instructions: string | null; servings: number; cookMinutes?: number | null; ingredients: Array<{ name: string; quantity: number | null; unit: string | null; originalName?: string | null }> }>('/api/recipes/from-url', { method: 'POST', body: JSON.stringify({ url }) }),

    parseRecipeText: (text: string) =>
      request<{ title: string; description: string | null; imageUrl: string | null; instructions: string | null; servings: number; cookMinutes?: number | null; ingredients: Array<{ name: string; quantity: number | null; unit: string | null; originalName?: string | null }> }>('/api/recipes/parse-text', { method: 'POST', body: JSON.stringify({ text }) }),

    parseRecipeFromPhoto: async (photoUris: string[]): Promise<{ title: string; description: string | null; imageUrl: string | null; instructions: string | null; servings: number; cookMinutes?: number | null; ingredients: Array<{ name: string; quantity: number | null; unit: string | null; originalName?: string | null }> } & { recipes?: { title: string; description: string | null; imageUrl: string | null; instructions: string | null; servings: number; cookMinutes?: number | null; ingredients: Array<{ name: string; quantity: number | null; unit: string | null; originalName?: string | null }> }[] }> => {
      // Skala ner och komprimera INNAN uppladdning. En okomprimerad mobilbild är
      // ~4 MB, och som base64 ~5,3 MB över mobilnät — det är den överföringen som
      // dominerar väntetiden. Modellen skalar ändå ner allt över 1568 px längsta
      // sida, så en större bild kostar bara tid och tokens utan bättre tolkning.
      // base64 hämtas direkt ur manipulatorn, vilket slipper varvet via
      // fetch → blob → FileReader.
      //
      // Sidorna komprimeras i följd, inte parallellt: flera samtidiga
      // bilddekodningar är ett minnestopp som fäller appen på svagare telefoner.
      const sidor: string[] = [];
      for (const uri of photoUris) {
        const compressed = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: await resizeFor(uri, 1568) }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true },
        );
        if (!compressed.base64) throw new Error(common.errors.couldNotLoad('bilden'));
        sidor.push(compressed.base64);
      }

      const token = await getToken();
      const res = await fetch(`${BASE_URL}/api/recipes/from-photo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ imageBase64: sidor }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<{ title: string; description: string | null; imageUrl: string | null; instructions: string | null; servings: number; cookMinutes?: number | null; ingredients: Array<{ name: string; quantity: number | null; unit: string | null; originalName?: string | null }> } & { recipes?: { title: string; description: string | null; imageUrl: string | null; instructions: string | null; servings: number; cookMinutes?: number | null; ingredients: Array<{ name: string; quantity: number | null; unit: string | null; originalName?: string | null }> }[] }>;
    },

    // Import till inköpslistan: text eller foto → varor att granska, sedan
    // alla valda i ett anrop.
    parseShoppingText: (text: string, householdId: string) =>
      request<{ items: ImportVara[]; kapad: boolean }>('/api/shopping/parse-text', { method: 'POST', body: JSON.stringify({ text, householdId }) }),

    // Rå fetch som receptfotot: ett automatiskt omförsök skulle dra från
    // fotokvoten en gång till.
    parseShoppingPhoto: async (uri: string, householdId: string): Promise<{ items: ImportVara[]; kapad: boolean }> => {
      const compressed = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: await resizeFor(uri, 1568) }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (!compressed.base64) throw new Error(common.errors.couldNotLoad('bilden'));
      const token = await getToken();
      const res = await fetch(`${BASE_URL}/api/shopping/parse-photo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ imageBase64: compressed.base64, householdId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<{ items: ImportVara[]; kapad: boolean }>;
    },

    // Skickas i omgångar: servern lägger till en vara i taget (sammanslagning
    // kräver det), så en enda lång lista hade blivit ett anrop som ligger och
    // tuggar i en halv minut. Omgångarna ger också något att visa räknaren på.
    addShoppingItemsBulk: async (listId: string, items: ImportVara[], onProgress?: (klara: number) => void) => {
      const OMGANG = 50;
      for (let i = 0; i < items.length; i += OMGANG) {
        const del = items.slice(i, i + OMGANG);
        await request<{ items: ShoppingItem[] }>(`/api/shopping/lists/${listId}/items/bulk`, {
          method: 'POST',
          body: JSON.stringify({
            items: del.map(v => ({
              name: v.name,
              ...(v.quantity ? { quantity: v.quantity } : {}),
              ...(v.unit ? { unit: v.unit } : {}),
            })),
          }),
        });
        onProgress?.(Math.min(i + OMGANG, items.length));
      }
    },

    // Menus
    getWeekMenu: (householdId: string, weekYear: number, weekNumber: number) =>
      request<WeekMenuItemWithRecipe[]>(`/api/menus?householdId=${householdId}&weekYear=${weekYear}&weekNumber=${weekNumber}`),

    getAllMenus: (householdId: string) =>
      request<WeekMenuItemWithRecipe[]>(`/api/menus?householdId=${householdId}`),

    addToWeekMenu: (data: { householdId: string; recipeId: string; day?: WeekDay | null; mealType?: MealType | null; weekYear: number; weekNumber: number; note?: string | null }) =>
      request<WeekMenuItemWithRecipe>('/api/menus', { method: 'POST', body: JSON.stringify(data) }),

    updateWeekMenuItem: (itemId: string, data: { day?: WeekDay | null; mealType?: MealType | null; note?: string | null; servings?: number | null }) =>
      request<WeekMenuItemWithRecipe>(`/api/menus/${itemId}`, { method: 'PATCH', body: JSON.stringify(data) }),

    deleteWeekMenuItem: (itemId: string) =>
      request<void>(`/api/menus/${itemId}`, { method: 'DELETE' }),

    transferToShopping: (listId: string, ingredients: Array<{ name: string; quantity: number | null; unit: string | null; category?: string; recipeId: string; menuItemId?: string }>) =>
      request<ShoppingItem[]>('/api/menus/to-shopping', { method: 'POST', body: JSON.stringify({ listId, ingredients }) }),

    getMenuTemplates: (householdId: string) =>
      request<MenuTemplate[]>(`/api/menus/templates?householdId=${householdId}`),

    saveMenuTemplate: (data: { householdId: string; name: string; weekYear: number; weekNumber: number }) =>
      request<MenuTemplate>('/api/menus/templates', { method: 'POST', body: JSON.stringify(data) }),

    applyMenuTemplate: (templateId: string, data: { weekYear: number; weekNumber: number; overwrite?: boolean }) =>
      request<{ applied: number }>(`/api/menus/templates/${templateId}/apply`, { method: 'POST', body: JSON.stringify(data) }),

    deleteMenuTemplate: (templateId: string) =>
      request<void>(`/api/menus/templates/${templateId}`, { method: 'DELETE' }),

    deleteItemsByMenuItemId: (listId: string, menuItemId: string) =>
      request<void>(`/api/shopping/lists/${listId}/items/by-menu-item/${menuItemId}`, { method: 'DELETE' }),

    // Staples
    getStaples: (householdId: string) =>
      request<StapleItem[]>(`/api/staples?householdId=${householdId}`),

    upsertStaple: (data: { householdId: string; name: string; category?: string; subCategory?: string | null; unit?: string | null; defaultQuantity?: number | null }) =>
      request<StapleItem>('/api/staples', { method: 'POST', body: JSON.stringify(data) }),

    deleteStaple: (stapleId: string) =>
      request<void>(`/api/staples/${stapleId}`, { method: 'DELETE' }),

    // Kanoniskt namn + kategori för inventeringens rader (hushållets val först).
    resolveInventoryNames: (householdId: string, names: string[]) =>
      request<{ name: string; canonical: string; category: string }[]>('/api/staples/resolve', { method: 'POST', body: JSON.stringify({ householdId, names }) }),

    getIngredientSuggestions: (householdId: string) =>
      request<{ name: string; category: string; subCategory?: string | null }[]>(`/api/staples/suggestions?householdId=${householdId}`),

    // Dölj ett sök-/ingrediensförslag för hushållet (långtryck → "ta bort förslag").
    hideSuggestion: (householdId: string, name: string) =>
      request<void>('/api/staples/hide-suggestion', { method: 'POST', body: JSON.stringify({ householdId, name }) }),

    // Ångra: visa förslaget igen.
    unhideSuggestion: (householdId: string, name: string) =>
      request<void>('/api/staples/hide-suggestion', { method: 'DELETE', body: JSON.stringify({ householdId, name }) }),

    updateShoppingList: (listId: string, data: { name?: string; emoji?: string | null; storeId?: string | null }) =>
      request<ShoppingListWithItems>(`/api/shopping/lists/${listId}`, { method: 'PATCH', body: JSON.stringify(data) }),

    // Push notifications
    registerPushToken: (token: string, platform?: string) =>
      request<{ id: string }>('/api/push/register', { method: 'POST', body: JSON.stringify({ token, platform }) }),

    unregisterPushToken: (token: string) =>
      request<void>('/api/push/unregister', { method: 'POST', body: JSON.stringify({ token }) }),

    getNotificationPreferences: () =>
      request<NotificationPreferences>('/api/push/preferences'),

    updateNotificationPreferences: (data: Partial<NotificationPreferences>) =>
      request<NotificationPreferences>('/api/push/preferences', { method: 'PATCH', body: JSON.stringify(data) }),

    sendTestPush: () =>
      request<{ tokens: number; errors: string[] }>('/api/push/test', { method: 'POST' }),

    getClientErrors: () =>
      request<ClientErrorEntry[]>('/api/client-errors'),

    // --- Adminsidan (bara appadmin; backenden spärrar resten) ---
    getIsAppAdmin: () =>
      request<{ isAdmin: boolean }>('/api/account/admin'),
    adminCategoryVotes: (min = 1) =>
      request<{ basvaror: number; oense: number; rader: AdminVoteRow[] }>(`/api/admin/category-votes?min=${min}`),
    adminCategoryGaps: () =>
      request<{ totalt: number; utanRegel: number; luckor: { namn: string; seenCount: number; lagradKategori: string }[] }>('/api/admin/category-gaps'),
    adminCandidates: () =>
      request<{ kandidater: number; rader: { name: string; seenCount: number; category: string }[] }>('/api/admin/candidates'),
    adminNewHouseholds: (since?: string) =>
      request<{ since: string; rader: { createdAt: string; members: number; recipes: number; lists: number; items: number; menuItems: number }[] }>(
        `/api/admin/new-households${since ? `?since=${encodeURIComponent(since)}` : ''}`,
      ),
    adminClassify: (name: string) =>
      request<AdminClassifyReport>(`/api/admin/classify?name=${encodeURIComponent(name)}`),
    adminCurated: () =>
      request<{ name: string; category: string; subCategory: string | null; updatedAt: string }[]>('/api/admin/curated'),
    adminCurationPreview: (data: { name: string; category: StoreCategory; subCategory: string | null }) =>
      request<AdminCurationImpact>('/api/admin/curated/preview', { method: 'POST', body: JSON.stringify(data) }),
    adminCurate: (data: { name: string; category: StoreCategory; subCategory: string | null; moveItems: boolean; resetChoices?: boolean }) =>
      request<{ name: string; itemsMoved: number }>('/api/admin/curated', { method: 'PUT', body: JSON.stringify(data) }),
    adminNames: (q = '') =>
      request<{ totalt: number; rader: { name: string; weight: number; junk: string | null }[] }>(`/api/admin/names${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    adminNameSuggestions: () =>
      request<{ förslag: number; rader: AdminNameSuggestion[] }>('/api/admin/name-suggestions'),
    adminNameImpact: (name: string, to?: string) =>
      request<{ from: AdminNameImpact; to: AdminNameImpact | null }>(`/api/admin/names/impact?name=${encodeURIComponent(name)}${to ? `&to=${encodeURIComponent(to)}` : ''}`),
    adminRenameIngredient: (from: string, to: string) =>
      request<{ aliasRows: number; staples: number; merged: number }>('/api/admin/names/rename', { method: 'POST', body: JSON.stringify({ from, to }) }),
    adminDeleteIngredient: (name: string) =>
      request<{ aliasRows: number; staples: number }>('/api/admin/names/delete', { method: 'POST', body: JSON.stringify({ name }) }),
    adminJobs: () =>
      request<AdminJob[]>('/api/admin/jobs'),
    adminJobPlan: (id: string) =>
      request<{ total: number; rows: AdminJobRow[]; note: string | null }>(`/api/admin/jobs/${encodeURIComponent(id)}/plan`, { method: 'POST' }),
    adminJobApply: (id: string, rows: { key: string; to: string }[]) =>
      request<{ summary: string }>(`/api/admin/jobs/${encodeURIComponent(id)}/apply`, { method: 'POST', body: JSON.stringify({ rows }) }),
    adminNoSubCategory: () =>
      request<{ antal: number; rader: { name: string; seenCount: number; category: string }[] }>('/api/admin/no-subcategory'),
    adminNamesBatch: (data: { action: 'delete' | 'merge'; names: string[]; to?: string }) =>
      request<{ names: number; staples: number }>('/api/admin/names/batch', { method: 'POST', body: JSON.stringify(data) }),
    adminRemoveCuration: (name: string) =>
      request<void>(`/api/admin/curated?name=${encodeURIComponent(name)}`, { method: 'DELETE' }),
  }), []);
}
