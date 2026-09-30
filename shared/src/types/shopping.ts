export type StoreCategory =
  | 'fruit_veg'
  | 'meat_fish'
  | 'deli_charcuterie'
  | 'cheese'
  | 'dairy_eggs'
  | 'bread_bakery'
  | 'frozen'
  | 'canned_dry'
  | 'snacks_sweets'
  | 'beverages'
  | 'special_diet'
  | 'cleaning'
  | 'personal_care'
  | 'baby_kids'
  | 'other';
export interface ShoppingList {
  id: string;
  householdId: string;
  name: string;
  emoji: string | null;
  storeId: string | null;
  isShared: boolean;
  createdBy: string;
  createdAt: string;
  completedAt: string | null;
  /** Vem som aktivt handlar listan just nu ("Jag handlar"-läge). null när
   *  ingen markerat sig. Andra hushållsmedlemmar ser indikatorn så ingen gör
   *  dubbla turer till affären. */
  activeShopperMemberId: string | null;
  activeShopperSince: string | null;
}

export interface ShoppingItem {
  id: string;
  listId: string;
  name: string;
  quantity: number;
  unit: string | null;
  category: StoreCategory;
  /** Källa till sanning för aggregering/AI/sök i 2-nivå-taxonomin. `category`
   *  härleds vid skapande från sub:ens defaultParent men kan override:as per
   *  item. Värdet är en `SubCategory` från `shared/lib/taxonomy.ts`. */
  subCategory: string | null;
  /** Hushålls-lokal egen PARENT-kategori (fri sträng). Matar aldrig den globala
   *  kategori-inlärningen — rent lokal placering. */
  customCategory: string | null;
  isChecked: boolean;
  checkedBy: string | null;
  addedBy: string;
  note: string | null;
  recipeId: string | null;
  menuItemId: string | null;
}

/** En butik i butiksbanken (OpenStreetMap). */
export interface BankStore {
  id: string;
  name: string;
  chain: string | null;
  street: string | null;
  postcode?: string | null;
  /** Orten som visas — i storstäderna stadsdel + stad ("Liljeholmen, Stockholm"). */
  city: string | null;
  /** Postorten, för postadressen. */
  postalCity?: string | null;
  /** Avstånd från sökningens position, när en position fanns. */
  distanceKm?: number | null;
}

export interface Store {
  id: string;
  householdId: string;
  name: string;
  /** Koppling till butiksbanken; null = en egen butik. */
  sharedStoreId?: string | null;
  sharedStore?: BankStore | null;
  categoryOrder: StoreCategory[];
  /** Subs (taxonomi-id:n) som visas som egna sektioner istället för att
   *  samlas under sin parent. */
  expandedSubs: string[];
  /** User-defined category labels for this store (appended after the default categories). */
  customCategories: string[];
  /** Enhetlig parent-ordning som blandar standard-kategorier och egna
   *  ("c:<egen>") i EN lista. Tom = härled från categoryOrder + customCategories. */
  parentOrder: string[];
  /** Ordning för STANDARD-subs som INTE är utbrutna (ej i expandedSubs) — så
   *  sorteringen kan förberedas innan en sub visas som egen sektion. */
  subOrder: string[];
  /** Kategori-ihopslagning: { sourceCategory: targetKey }. sourceCategory
   *  (alltid en riktig StoreCategory) slås ihop med targetKey (StoreCategory
   *  ELLER "c:<egen kategori>") vid visning — varans egen category ändras
   *  aldrig, bara vilken sektion den grupperas under i just den här butiken. */
  categoryMerge: Record<string, string>;
}
