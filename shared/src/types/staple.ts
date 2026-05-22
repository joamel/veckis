import type { StoreCategory } from './shopping';

export interface StapleItem {
  id: string;
  householdId: string;
  name: string;
  category: StoreCategory;
  unit: string | null;
  defaultQuantity: number | null;
  usageCount: number;
}

export const CATEGORY_LABELS: Record<StoreCategory, string> = {
  fruit_veg: 'Frukt & grönt',
  meat_fish: 'Kött & fisk',
  dairy_eggs: 'Mejeri & ägg',
  bread_bakery: 'Bröd & bageri',
  frozen: 'Frysvaror',
  canned_dry: 'Konserver & torrvaror',
  snacks_sweets: 'Snacks & godis',
  beverages: 'Drycker',
  cleaning: 'Städ & rengöring',
  personal_care: 'Hygien & personvård',
  other: 'Övrigt',
};

export const DEFAULT_CATEGORY_ORDER: StoreCategory[] = [
  'fruit_veg','meat_fish','dairy_eggs','bread_bakery',
  'frozen','canned_dry','snacks_sweets','beverages',
  'cleaning','personal_care','other',
];
