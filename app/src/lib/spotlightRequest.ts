// Cross-screen "peka hit"-request för Kom igång-kortet.
//
// Kortet ligger på en flik men vill peka ut en kontroll på EN ANNAN flik (t.ex.
// recept-FAB:en). Man kan inte lysa upp ett element som inte är renderat, så
// flödet är: kortet anropar `requestSpotlight(key)` + navigerar → målskärmen
// konsumerar requesten i sin `useFocusEffect` (när den är renderad, spinnern
// släppt) och tänder spotlighten på sin registrerade `targetRef`.
//
// Enkel modul-global (samma mönster som shoppingEvents) — bara EN pending åt
// gången, vilket räcker (användaren trycker en rad i taget).

let pending: string | null = null;

/** Kortet: begär att `key`-kontrollen ska highlightas efter navigering. */
export function requestSpotlight(key: string): void {
  pending = key;
}

/** Målskärmen: returnerar true EN gång om just denna `key` är begärd (och
 *  nollställer den då), annars false. */
export function consumeSpotlight(key: string): boolean {
  if (pending === key) {
    pending = null;
    return true;
  }
  return false;
}
