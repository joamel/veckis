export type StoreCategory =
  | 'fruit_veg'
  | 'meat_fish'
  | 'deli_charcuterie'
  | 'dairy_eggs'
  | 'bread_bakery'
  | 'frozen'
  | 'canned_dry'
  | 'snacks_sweets'
  | 'beverages'
  | 'special_diet'
  | 'cleaning'
  | 'personal_care'
  | 'other';
export interface ShoppingList {
  id: string;
  householdId: string;
  name: string;
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
  /** DEPREKERAD — kvar för bakåtkompatibilitet, migreras till `subCategory`. */
  customCategory: string | null;
  isChecked: boolean;
  checkedBy: string | null;
  addedBy: string;
  note: string | null;
  recipeId: string | null;
  menuItemId: string | null;
}

export interface Store {
  id: string;
  householdId: string;
  name: string;
  categoryOrder: StoreCategory[];
  /** User-defined category labels for this store (appended after the default categories). */
  customCategories: string[];
}
