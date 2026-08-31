import { useAuth } from '@clerk/clerk-expo';
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
} from '@veckis/shared';
import { trackBackendRequest } from '../lib/backendWakeup';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

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

export type MembershipWithHousehold = HouseholdMember & { household: Household };
export type ShoppingItemWithRecipe = ShoppingItem & { recipe: { id: string; title: string } | null };
export type ShoppingListWithItems = ShoppingList & { items: ShoppingItemWithRecipe[]; store: Store | null };

export function useApiClient() {
  const { getToken } = useAuth();

  async function request<T>(path: string, options: RequestInit = {}, attempt = 0): Promise<T> {
    const token = await getToken();
    const url = `${BASE_URL}${path}`;
    // Kallstart-retry: gratis-hosting spinner ner (Render) och Neon-DB:n
    // autosuspendar (vaknar med 57P01 → 5xx). Retry:a BARA idempotenta anrop
    // (GET/HEAD) med backoff, så en laddning under uppvaknandet lyckas tyst i
    // stället för att visa råa fel. Muterande anrop retry:as ej (dubblett-risk).
    const method = (options.method ?? 'GET').toUpperCase();
    const canRetry = (method === 'GET' || method === 'HEAD') && attempt < 3;
    const backoff = () => new Promise(r => setTimeout(r, [1500, 4000, 9000][attempt] ?? 9000));
    let res: Response;
    try {
      // trackBackendRequest visar "Vaknar…"-indikatorn om fetch:en dröjer >3s
      // (kallstart) och släcker den när backend svarar. Utan detta retry:ade
      // klienten tyst utan feedback → appen såg trasig ut under uppvaknandet.
      res = await trackBackendRequest(fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...options.headers,
        },
      }));
    } catch {
      // fetch rejects (rather than resolving with !ok) when the request never
      // reached the server: no connectivity, DNS failure, server down, etc.
      if (canRetry) { await backoff(); return request<T>(path, options, attempt + 1); }
      throw new ApiError('Network request failed', null, true);
    }

    if (!res.ok) {
      // 5xx = servern uppe men beroende (oftast DB:n) vaknar → retry:a idempotenta.
      if (res.status >= 500 && canRetry) { await backoff(); return request<T>(path, options, attempt + 1); }
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(err.error ?? `HTTP ${res.status}`, res.status, false);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  return {
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
      const token = await getToken();
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

    addShoppingItem: (listId: string, data: { name: string; quantity?: number; unit?: string; category?: StoreCategory; subCategory?: string | null; customCategory?: string | null; customSubCategory?: string | null; note?: string }) =>
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

    updateShoppingItem: (itemId: string, data: Partial<Pick<ShoppingItem, 'name' | 'quantity' | 'unit' | 'category' | 'customCategory' | 'customSubCategory' | 'subCategory' | 'note'>>) =>
      request<ShoppingItem>(`/api/shopping/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    checkShoppingItem: (itemId: string, checked: boolean) =>
      request<ShoppingItem>(`/api/shopping/items/${itemId}/check`, {
        method: 'PATCH',
        body: JSON.stringify({ checked }),
      }),

    deleteShoppingItem: (itemId: string) =>
      request<void>(`/api/shopping/items/${itemId}`, { method: 'DELETE' }),

    // Stores
    getStores: (householdId: string) =>
      request<Store[]>(`/api/stores?householdId=${householdId}`),

    createStore: (data: { householdId: string; name: string; categoryOrder?: StoreCategory[]; customCategories?: string[]; expandedSubs?: string[]; customSubs?: Record<string, string[]>; parentOrder?: string[] }) =>
      request<Store>('/api/stores', { method: 'POST', body: JSON.stringify(data) }),

    updateStore: (storeId: string, data: { name?: string; categoryOrder?: StoreCategory[]; customCategories?: string[]; expandedSubs?: string[]; customSubs?: Record<string, string[]>; parentOrder?: string[] }) =>
      request<Store>(`/api/stores/${storeId}`, { method: 'PATCH', body: JSON.stringify(data) }),

    deleteStore: (storeId: string) =>
      request<void>(`/api/stores/${storeId}`, { method: 'DELETE' }),

    // Recipes
    getRecipes: (householdId: string) =>
      request<RecipeWithIngredients[]>(`/api/recipes?householdId=${householdId}`),

    getRecipe: (recipeId: string) =>
      request<RecipeWithIngredients>(`/api/recipes/${recipeId}`),

    createRecipe: (data: { householdId: string; title: string; description?: string | null; instructions?: string | null; sourceUrl?: string | null; source?: 'manual' | 'ai_paste' | 'url_import'; imageUrl?: string | null; servings?: number; ingredients?: Array<{ name: string; quantity?: number | null; unit?: string | null; category?: StoreCategory }>; tags?: string[] }) =>
      request<RecipeWithIngredients>('/api/recipes', { method: 'POST', body: JSON.stringify(data) }),

    updateRecipe: (recipeId: string, data: { title?: string; description?: string | null; instructions?: string | null; imageUrl?: string | null; servings?: number; ingredients?: Array<{ name: string; quantity?: number | null; unit?: string | null; category?: StoreCategory }>; tags?: string[] }) =>
      request<RecipeWithIngredients>(`/api/recipes/${recipeId}`, { method: 'PATCH', body: JSON.stringify(data) }),

    deleteRecipe: (recipeId: string) =>
      request<void>(`/api/recipes/${recipeId}`, { method: 'DELETE' }),

    uploadRecipeImage: async (recipeId: string, fileUri: string, mimeType = 'image/jpeg'): Promise<RecipeWithIngredients> => {
      const form = new FormData();
      // RN's FormData accepts the file blob descriptor object directly.
      form.append('image', { uri: fileUri, name: 'recipe.jpg', type: mimeType } as unknown as Blob);
      const token = await getToken();
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
      request<{ title: string; description: string | null; imageUrl: string | null; instructions: string | null; servings: number; ingredients: Array<{ name: string; quantity: number | null; unit: string | null }> }>('/api/recipes/from-url', { method: 'POST', body: JSON.stringify({ url }) }),

    parseRecipeText: (text: string) =>
      request<{ title: string; description: string | null; imageUrl: string | null; instructions: string | null; servings: number; ingredients: Array<{ name: string; quantity: number | null; unit: string | null }> }>('/api/recipes/parse-text', { method: 'POST', body: JSON.stringify({ text }) }),

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

    upsertStaple: (data: { householdId: string; name: string; category?: string; unit?: string | null; defaultQuantity?: number | null }) =>
      request<StapleItem>('/api/staples', { method: 'POST', body: JSON.stringify(data) }),

    deleteStaple: (stapleId: string) =>
      request<void>(`/api/staples/${stapleId}`, { method: 'DELETE' }),

    getIngredientSuggestions: (householdId: string) =>
      request<{ name: string; category: string }[]>(`/api/staples/suggestions?householdId=${householdId}`),

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
  };
}
