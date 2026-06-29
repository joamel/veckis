// 2-nivå-taxonomi för varukategorier.
//
// Varor lagrar BÅDE `subCategory` (källa till sanning för aggregering, AI och
// sök) OCH `category` (parent — var varan placeras i butikens layout). Vid
// skapande sätts `category` automatiskt till sub:ens `defaultParent`. Användaren
// kan override:a per item om butiken placerar varan annorlunda.
//
// `alsoUnder` är ren metadata för butikskonfigens UI: subs som logiskt kan
// claim:as av flera parents (t.ex. delikatessost passar både i charkdisken och
// i mejerihyllan). Påverkar INTE rendering — varje item visas på exakt en
// plats baserat på sitt `category`-fält.

import type { StoreCategory } from '../types/shopping';

export type SubCategory =
  // Frukt & grönt
  | 'frukt'
  | 'bär'
  | 'grönsaker'
  | 'rotsaker'
  | 'lök_vitlök'
  | 'örter_sallad'
  // Kött & fisk
  | 'nöt'
  | 'fläsk'
  | 'kyckling_fågel'
  | 'färs'
  | 'fisk'
  | 'skaldjur'
  | 'färdiga_såser_kylda'
  // Chark & deli
  | 'skinka_pålägg'
  | 'korv_charcuteri'
  | 'delikatessost'
  | 'pâté_terrin'
  | 'oliver_antipasto'
  // Mejeri & ägg
  | 'mjölk'
  | 'yoghurt_fil'
  | 'smör_margarin'
  | 'ost'
  | 'grädde'
  | 'ägg'
  | 'laktosfritt'
  | 'mejerisubstitut'
  // Bröd & bageri
  | 'bröd'
  | 'knäckebröd_skorpor'
  | 'bakverk_kex'
  // Frysvaror
  | 'frysta_grönsaker'
  | 'frysta_bär_frukt'
  | 'glass'
  | 'fryst_kött_fågel'
  | 'fryst_fisk'
  | 'frysta_färdigrätter'
  | 'fryst_bröd_deg'
  // Konserver & torrvaror
  | 'pasta_nudlar'
  | 'ris_gryn'
  | 'konserver'
  | 'baljväxter'
  | 'mjöl_bakingredienser'
  | 'olja_vinäger'
  | 'kryddor_buljong'
  | 'sås_dressing'
  | 'nötter_frön_torra'
  // Snacks & godis
  | 'godis'
  | 'choklad'
  | 'chips_salt'
  // Drycker
  | 'läsk'
  | 'juice'
  | 'vatten'
  | 'kaffe'
  | 'te'
  | 'alkoholfritt_öl_cider'
  | 'alkoholhaltigt'
  // Specialkost
  | 'vegan'
  | 'glutenfritt'
  | 'övrig_specialkost'
  // Städ & rengöring
  | 'diskmedel'
  | 'tvättmedel'
  | 'ytrengöring'
  | 'städredskap'
  | 'toalett_hushållspapper'
  // Hygien & personvård
  | 'tandvård'
  | 'hårvård'
  | 'duschtvål_hudvård'
  | 'intimhygien'
  | 'mediciner'
  // Övrigt
  | 'husdjur'
  | 'baby_barn'
  | 'blommor_växter'
  | 'hushållsvaror'
  | 'batteri_elektronik';

interface SubInfo {
  /** Var sub:en default-placeras i butikens layout. */
  defaultParent: StoreCategory;
  /** Andra parents där sub:en logiskt också kan höra hemma. Används i butiks-
   *  konfigurations-UI:t (V2: claim per butik). Påverkar inte rendering. */
  alsoUnder: StoreCategory[];
  /** Visningsnamn på svenska. */
  label: string;
}

export const SUB_TAXONOMY: Record<SubCategory, SubInfo> = {
  // Frukt & grönt
  frukt: { defaultParent: 'fruit_veg', alsoUnder: [], label: 'Frukt' },
  bär: { defaultParent: 'fruit_veg', alsoUnder: [], label: 'Bär' },
  grönsaker: { defaultParent: 'fruit_veg', alsoUnder: [], label: 'Grönsaker' },
  rotsaker: { defaultParent: 'fruit_veg', alsoUnder: [], label: 'Rotsaker' },
  lök_vitlök: { defaultParent: 'fruit_veg', alsoUnder: [], label: 'Lök & vitlök' },
  örter_sallad: { defaultParent: 'fruit_veg', alsoUnder: [], label: 'Örter & sallad' },
  // Kött & fisk
  nöt: { defaultParent: 'meat_fish', alsoUnder: [], label: 'Nöt' },
  fläsk: { defaultParent: 'meat_fish', alsoUnder: [], label: 'Fläsk' },
  kyckling_fågel: { defaultParent: 'meat_fish', alsoUnder: [], label: 'Kyckling & fågel' },
  färs: { defaultParent: 'meat_fish', alsoUnder: [], label: 'Färs' },
  fisk: { defaultParent: 'meat_fish', alsoUnder: [], label: 'Fisk' },
  skaldjur: { defaultParent: 'meat_fish', alsoUnder: [], label: 'Skaldjur' },
  färdiga_såser_kylda: { defaultParent: 'meat_fish', alsoUnder: ['canned_dry'], label: 'Färdiga såser (kylda)' },
  // Chark & deli (egen parent)
  skinka_pålägg: { defaultParent: 'deli_charcuterie', alsoUnder: ['meat_fish'], label: 'Skinka & pålägg' },
  korv_charcuteri: { defaultParent: 'deli_charcuterie', alsoUnder: ['meat_fish'], label: 'Korv (charcuteri)' },
  pâté_terrin: { defaultParent: 'deli_charcuterie', alsoUnder: ['meat_fish'], label: 'Pâté & terrin' },
  oliver_antipasto: { defaultParent: 'deli_charcuterie', alsoUnder: ['canned_dry'], label: 'Oliver & antipasto' },
  // Ost (egen parent)
  ost: { defaultParent: 'cheese', alsoUnder: [], label: 'Ost' },
  delikatessost: { defaultParent: 'cheese', alsoUnder: [], label: 'Delikatessost' },
  // Mejeri & ägg
  mjölk: { defaultParent: 'dairy_eggs', alsoUnder: [], label: 'Mjölk' },
  yoghurt_fil: { defaultParent: 'dairy_eggs', alsoUnder: [], label: 'Yoghurt & fil' },
  smör_margarin: { defaultParent: 'dairy_eggs', alsoUnder: [], label: 'Smör & margarin' },
  grädde: { defaultParent: 'dairy_eggs', alsoUnder: [], label: 'Grädde' },
  ägg: { defaultParent: 'dairy_eggs', alsoUnder: [], label: 'Ägg' },
  laktosfritt: { defaultParent: 'dairy_eggs', alsoUnder: [], label: 'Laktosfritt' },
  mejerisubstitut: { defaultParent: 'dairy_eggs', alsoUnder: [], label: 'Mejerisubstitut (havre, soja)' },
  // Bröd & bageri
  bröd: { defaultParent: 'bread_bakery', alsoUnder: [], label: 'Bröd' },
  knäckebröd_skorpor: { defaultParent: 'bread_bakery', alsoUnder: [], label: 'Knäckebröd & skorpor' },
  bakverk_kex: { defaultParent: 'bread_bakery', alsoUnder: [], label: 'Bakverk & kex' },
  // Frysvaror
  frysta_grönsaker: { defaultParent: 'frozen', alsoUnder: [], label: 'Frysta grönsaker' },
  frysta_bär_frukt: { defaultParent: 'frozen', alsoUnder: [], label: 'Frysta bär & frukt' },
  glass: { defaultParent: 'frozen', alsoUnder: [], label: 'Glass' },
  fryst_kött_fågel: { defaultParent: 'frozen', alsoUnder: [], label: 'Fryst kött & fågel' },
  fryst_fisk: { defaultParent: 'frozen', alsoUnder: [], label: 'Fryst fisk' },
  frysta_färdigrätter: { defaultParent: 'frozen', alsoUnder: [], label: 'Frysta färdigrätter' },
  fryst_bröd_deg: { defaultParent: 'frozen', alsoUnder: [], label: 'Fryst bröd & deg' },
  // Konserver & torrvaror
  pasta_nudlar: { defaultParent: 'canned_dry', alsoUnder: [], label: 'Pasta & nudlar' },
  ris_gryn: { defaultParent: 'canned_dry', alsoUnder: [], label: 'Ris & gryn' },
  konserver: { defaultParent: 'canned_dry', alsoUnder: [], label: 'Konserver' },
  baljväxter: { defaultParent: 'canned_dry', alsoUnder: [], label: 'Baljväxter' },
  mjöl_bakingredienser: { defaultParent: 'canned_dry', alsoUnder: [], label: 'Mjöl & bakingredienser' },
  olja_vinäger: { defaultParent: 'canned_dry', alsoUnder: [], label: 'Olja & vinäger' },
  kryddor_buljong: { defaultParent: 'canned_dry', alsoUnder: [], label: 'Kryddor & buljong' },
  sås_dressing: { defaultParent: 'canned_dry', alsoUnder: [], label: 'Sås & dressing (skafferi)' },
  nötter_frön_torra: { defaultParent: 'canned_dry', alsoUnder: ['snacks_sweets'], label: 'Nötter & frön (torra)' },
  // Snacks & godis
  godis: { defaultParent: 'snacks_sweets', alsoUnder: [], label: 'Godis' },
  choklad: { defaultParent: 'snacks_sweets', alsoUnder: [], label: 'Choklad' },
  chips_salt: { defaultParent: 'snacks_sweets', alsoUnder: [], label: 'Chips & salt' },
  // Drycker
  läsk: { defaultParent: 'beverages', alsoUnder: [], label: 'Läsk' },
  juice: { defaultParent: 'beverages', alsoUnder: [], label: 'Juice' },
  vatten: { defaultParent: 'beverages', alsoUnder: [], label: 'Vatten' },
  kaffe: { defaultParent: 'beverages', alsoUnder: [], label: 'Kaffe' },
  te: { defaultParent: 'beverages', alsoUnder: [], label: 'Te' },
  alkoholfritt_öl_cider: { defaultParent: 'beverages', alsoUnder: [], label: 'Alkoholfritt öl & cider' },
  alkoholhaltigt: { defaultParent: 'beverages', alsoUnder: [], label: 'Alkoholhaltigt' },
  // Specialkost (egen parent)
  vegan: { defaultParent: 'special_diet', alsoUnder: [], label: 'Vegan' },
  glutenfritt: { defaultParent: 'special_diet', alsoUnder: ['bread_bakery'], label: 'Glutenfritt' },
  övrig_specialkost: { defaultParent: 'special_diet', alsoUnder: [], label: 'Övrig specialkost' },
  // Städ & rengöring
  diskmedel: { defaultParent: 'cleaning', alsoUnder: [], label: 'Diskmedel' },
  tvättmedel: { defaultParent: 'cleaning', alsoUnder: [], label: 'Tvättmedel' },
  ytrengöring: { defaultParent: 'cleaning', alsoUnder: [], label: 'Ytrengöring' },
  städredskap: { defaultParent: 'cleaning', alsoUnder: [], label: 'Städredskap' },
  toalett_hushållspapper: { defaultParent: 'cleaning', alsoUnder: [], label: 'Toalett- & hushållspapper' },
  // Hygien & personvård
  tandvård: { defaultParent: 'personal_care', alsoUnder: [], label: 'Tandvård' },
  hårvård: { defaultParent: 'personal_care', alsoUnder: [], label: 'Hårvård' },
  duschtvål_hudvård: { defaultParent: 'personal_care', alsoUnder: [], label: 'Duschtvål & hudvård' },
  intimhygien: { defaultParent: 'personal_care', alsoUnder: [], label: 'Intimhygien' },
  mediciner: { defaultParent: 'personal_care', alsoUnder: [], label: 'Mediciner & sjukvård' },
  // Övrigt
  husdjur: { defaultParent: 'other', alsoUnder: [], label: 'Husdjur' },
  baby_barn: { defaultParent: 'other', alsoUnder: [], label: 'Baby & barn' },
  blommor_växter: { defaultParent: 'other', alsoUnder: [], label: 'Blommor & växter' },
  hushållsvaror: { defaultParent: 'other', alsoUnder: [], label: 'Hushållsvaror' },
  batteri_elektronik: { defaultParent: 'other', alsoUnder: [], label: 'Batteri & elektronik' },
};

/** Alla sub-värden — för enum-iteration. */
export const ALL_SUB_CATEGORIES: SubCategory[] = Object.keys(SUB_TAXONOMY) as SubCategory[];

/** Map parent → subs vars defaultParent ÄR parent. Visas i butikskonfigens
 *  "expandera parent"-vy. */
export function subsForParent(parent: StoreCategory): SubCategory[] {
  return ALL_SUB_CATEGORIES.filter(s => SUB_TAXONOMY[s].defaultParent === parent);
}

/** Map parent → subs vars alsoUnder INNEHÅLLER parent. Visas i butikskonfigens
 *  "kan claim:as här"-lista (V2). */
export function subsAlsoUnder(parent: StoreCategory): SubCategory[] {
  return ALL_SUB_CATEGORIES.filter(s => SUB_TAXONOMY[s].alsoUnder.includes(parent));
}

/** Slå upp en sub:s default-parent. */
export function parentForSub(sub: SubCategory): StoreCategory {
  return SUB_TAXONOMY[sub].defaultParent;
}
