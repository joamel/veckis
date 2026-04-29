export type StoreCategory =
  | 'fruit_veg'
  | 'meat_fish'
  | 'dairy_eggs'
  | 'bread_bakery'
  | 'frozen'
  | 'canned_dry'
  | 'snacks_sweets'
  | 'beverages'
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
}

export interface ShoppingItem {
  id: string;
  listId: string;
  name: string;
  quantity: number;
  unit: string | null;
  category: StoreCategory;
  isChecked: boolean;
  checkedBy: string | null;
  addedBy: string;
  note: string | null;
}

export interface Store {
  id: string;
  householdId: string;
  name: string;
  categoryOrder: StoreCategory[];
}
