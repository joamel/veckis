import { useAuth } from '@clerk/clerk-expo';
import type {
  Household,
  HouseholdMember,
  InviteCode,
  ShoppingList,
  ShoppingItem,
  Store,
  StoreCategory,
  Chore,
  ChoreCompletion,
  ChoreFrequency,
  ScheduleEntry,
  WeekDay,
  RecurrenceType,
  Recipe,
  RecipeIngredient,
  WeekMenuItem,
  StapleItem,
} from '@veckis/shared';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export type { StoreCategory, ChoreFrequency, WeekDay };

export type RecipeWithIngredients = Recipe & { ingredients: RecipeIngredient[] };
export type WeekMenuItemWithRecipe = WeekMenuItem & { recipe: RecipeWithIngredients };

export type HouseholdWithMembers = Household & { members: HouseholdMember[]; stores: Store[] };
export type MembershipWithHousehold = HouseholdMember & { household: Household };
export type ShoppingItemWithRecipe = ShoppingItem & { recipe: { id: string; title: string } | null };
export type ShoppingListWithItems = ShoppingList & { items: ShoppingItemWithRecipe[]; store: Store | null };

export function useApiClient() {
  const { getToken } = useAuth();

  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = await getToken();
    const url = `${BASE_URL}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error ?? `HTTP ${res.status}`);
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

    removeMember: (householdId: string, memberId: string) =>
      request<void>(`/api/households/${householdId}/members/${memberId}`, { method: 'DELETE' }),

    updateMember: (householdId: string, memberId: string, data: { displayName?: string; role?: 'admin' | 'member' }) =>
      request<HouseholdMember>(`/api/households/${householdId}/members/${memberId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    createLocalMember: (householdId: string, displayName: string) =>
      request<HouseholdMember>(`/api/households/${householdId}/members`, {
        method: 'POST',
        body: JSON.stringify({ displayName }),
      }),

    // Shopping
    getShoppingLists: (householdId: string) =>
      request<ShoppingListWithItems[]>(`/api/shopping/lists?householdId=${householdId}`),

    getShoppingList: (listId: string) =>
      request<ShoppingListWithItems>(`/api/shopping/lists/${listId}`),

    createShoppingList: (data: { householdId: string; name: string; storeId?: string; isShared?: boolean }) =>
      request<ShoppingListWithItems>('/api/shopping/lists', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    completeShoppingList: (listId: string) =>
      request<ShoppingList>(`/api/shopping/lists/${listId}/complete`, { method: 'PATCH' }),

    clearShoppingList: (listId: string) =>
      request<void>(`/api/shopping/lists/${listId}/items`, { method: 'DELETE' }),

    deleteShoppingList: (listId: string) =>
      request<void>(`/api/shopping/lists/${listId}`, { method: 'DELETE' }),

    addShoppingItem: (listId: string, data: { name: string; quantity?: number; unit?: string; category?: StoreCategory; note?: string }) =>
      request<ShoppingItem>(`/api/shopping/lists/${listId}/items`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    mergeShoppingItems: (data: { keepId: string; removeIds: string[]; name?: string; quantity?: number; unit?: string | null; category?: string }) =>
      request<ShoppingItem>('/api/shopping/items/merge', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    updateShoppingItem: (itemId: string, data: Partial<Pick<ShoppingItem, 'name' | 'quantity' | 'unit' | 'category' | 'note'>>) =>
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

    createStore: (data: { householdId: string; name: string; categoryOrder?: StoreCategory[] }) =>
      request<Store>('/api/stores', { method: 'POST', body: JSON.stringify(data) }),

    updateStore: (storeId: string, data: { name?: string; categoryOrder?: StoreCategory[] }) =>
      request<Store>(`/api/stores/${storeId}`, { method: 'PATCH', body: JSON.stringify(data) }),

    deleteStore: (storeId: string) =>
      request<void>(`/api/stores/${storeId}`, { method: 'DELETE' }),

    // Chores
    getChores: (householdId: string) =>
      request<(Chore & { completions: ChoreCompletion[] })[]>(`/api/chores?householdId=${householdId}`),

    createChore: (data: { householdId: string; title: string; description?: string; frequency?: ChoreFrequency; assignedTo?: string | null; days?: WeekDay[]; isShared?: boolean; startDate?: string | null; endDate?: string | null }) =>
      request<Chore>('/api/chores', { method: 'POST', body: JSON.stringify(data) }),

    updateChore: (choreId: string, data: Partial<Pick<Chore, 'title' | 'description' | 'frequency' | 'assignedTo' | 'days' | 'isShared' | 'startDate' | 'endDate'>>) =>
      request<Chore>(`/api/chores/${choreId}`, { method: 'PATCH', body: JSON.stringify(data) }),

    deleteChore: (choreId: string) =>
      request<void>(`/api/chores/${choreId}`, { method: 'DELETE' }),

    completeChore: (choreId: string, day?: WeekDay | null, note?: string) =>
      request<ChoreCompletion>(`/api/chores/${choreId}/complete`, {
        method: 'POST',
        body: JSON.stringify({ day, note }),
      }),

    getChoreCompletions: (choreId: string) =>
      request<ChoreCompletion[]>(`/api/chores/${choreId}/completions`),

    uncompleteChore: (choreId: string, day?: WeekDay | null) => {
      const qs = day ? `?day=${day}` : '';
      return request<void>(`/api/chores/${choreId}/complete${qs}`, { method: 'DELETE' });
    },

    // Schedule
    getSchedule: (householdId: string) =>
      request<ScheduleEntry[]>(`/api/schedule?householdId=${householdId}`),

    createScheduleEntry: (data: { householdId: string; title: string; day: WeekDay; description?: string; startTime?: string; endTime?: string; assignedTo?: string; isShared?: boolean; recurrenceType?: RecurrenceType; recurrenceDays?: WeekDay[]; recurrenceWeeks?: number; monthlyType?: string; recurrenceWeekOfMonth?: number | null; startDate?: string | null; endDate?: string | null }) =>
      request<ScheduleEntry>('/api/schedule', { method: 'POST', body: JSON.stringify(data) }),

    updateScheduleEntry: (entryId: string, data: Partial<Omit<ScheduleEntry, 'id' | 'householdId' | 'createdBy'>>) =>
      request<ScheduleEntry>(`/api/schedule/${entryId}`, { method: 'PATCH', body: JSON.stringify(data) }),

    deleteScheduleEntry: (entryId: string, date?: string) => {
      const qs = date ? `?date=${date}` : '';
      return request<void | ScheduleEntry>(`/api/schedule/${entryId}${qs}`, { method: 'DELETE' });
    },

    // Recipes
    getRecipes: (householdId: string) =>
      request<RecipeWithIngredients[]>(`/api/recipes?householdId=${householdId}`),

    getRecipe: (recipeId: string) =>
      request<RecipeWithIngredients>(`/api/recipes/${recipeId}`),

    createRecipe: (data: { householdId: string; title: string; description?: string | null; sourceUrl?: string | null; imageUrl?: string | null; servings?: number; ingredients?: Array<{ name: string; quantity?: number | null; unit?: string | null; category?: StoreCategory }> }) =>
      request<RecipeWithIngredients>('/api/recipes', { method: 'POST', body: JSON.stringify(data) }),

    updateRecipe: (recipeId: string, data: { title?: string; description?: string | null; servings?: number; ingredients?: Array<{ name: string; quantity?: number | null; unit?: string | null; category?: StoreCategory }> }) =>
      request<RecipeWithIngredients>(`/api/recipes/${recipeId}`, { method: 'PATCH', body: JSON.stringify(data) }),

    deleteRecipe: (recipeId: string) =>
      request<void>(`/api/recipes/${recipeId}`, { method: 'DELETE' }),

    scrapeRecipe: (url: string) =>
      request<{ title: string; description: string | null; imageUrl: string | null; servings: number; ingredients: Array<{ name: string; quantity: number | null; unit: string | null }> }>('/api/recipes/from-url', { method: 'POST', body: JSON.stringify({ url }) }),

    // Menus
    getWeekMenu: (householdId: string, weekYear: number, weekNumber: number) =>
      request<WeekMenuItemWithRecipe[]>(`/api/menus?householdId=${householdId}&weekYear=${weekYear}&weekNumber=${weekNumber}`),

    getAllMenus: (householdId: string) =>
      request<WeekMenuItemWithRecipe[]>(`/api/menus?householdId=${householdId}`),

    addToWeekMenu: (data: { householdId: string; recipeId: string; day?: WeekDay | null; weekYear: number; weekNumber: number; note?: string | null }) =>
      request<WeekMenuItemWithRecipe>('/api/menus', { method: 'POST', body: JSON.stringify(data) }),

    updateWeekMenuItem: (itemId: string, data: { day?: WeekDay | null; note?: string | null }) =>
      request<WeekMenuItemWithRecipe>(`/api/menus/${itemId}`, { method: 'PATCH', body: JSON.stringify(data) }),

    deleteWeekMenuItem: (itemId: string) =>
      request<void>(`/api/menus/${itemId}`, { method: 'DELETE' }),

    transferToShopping: (listId: string, ingredients: Array<{ name: string; quantity: number | null; unit: string | null; category?: string; recipeId: string; menuItemId?: string }>) =>
      request<ShoppingItem[]>('/api/menus/to-shopping', { method: 'POST', body: JSON.stringify({ listId, ingredients }) }),

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

    updateShoppingList: (listId: string, data: { name?: string; storeId?: string | null }) =>
      request<ShoppingListWithItems>(`/api/shopping/lists/${listId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  };
}
