type StoreAddress = {
  street?: string | null;
  postcode?: string | null;
  city?: string | null;
  postalCity?: string | null;
};

/**
 * Raderna under en butiks namn i butiksbanken:
 *  - locality: orten, alltid — även när namnet redan säger den, för
 *    tydlighetens skull. I storstäderna stadsdel + stad ("Årsta, Stockholm").
 *  - address: postadressen ("Årstavägen 1, 120 51 Årsta"), när OSM har den.
 *    Bara 40 % av butikerna har gata; Sjövikshallen har ingen adress alls.
 */
export function storeMeta(store: StoreAddress): { locality: string; address: string } {
  const locality = store.city?.trim() ?? '';
  const pn = store.postcode?.replace(/[^0-9]/g, '') ?? '';
  const postnummer = pn.length === 5 ? `${pn.slice(0, 3)} ${pn.slice(3)}` : '';
  const postort = [postnummer, store.postalCity?.trim()].filter(Boolean).join(' ');
  const address = [store.street?.trim(), postort].filter(Boolean).join(', ');
  // Bara en postort som är samma som orten säger inget nytt.
  return { locality, address: address === locality ? '' : address };
}
