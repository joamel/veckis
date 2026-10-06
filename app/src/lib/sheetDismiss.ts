// Ska ett ark stängas när fingret släpps? Förlåtande åt båda håll:
// - Kastar man arket UPPÅT igen vid släppet ångrar man sig — det stannar,
//   hur långt ned det än var draget. (Förr stängde avståndet ensamt.)
// - En snabb svep nedåt stänger även om den var kort.
// - Annars avgör avståndet.
// Körs i reanimateds UI-tråd, därav 'worklet'.

export const DISMISS_DISTANCE = 100;
export const DISMISS_VELOCITY = 1000;
// Rörelse uppåt (negativ hastighet) snabbare än så här räknas som "ångra".
const UNDO_VELOCITY = -150;

export function shouldDismissSheet(translationY: number, velocityY: number): boolean {
  'worklet';
  if (velocityY < UNDO_VELOCITY) return false;
  if (velocityY > DISMISS_VELOCITY && translationY > 16) return true;
  return translationY > DISMISS_DISTANCE;
}
