/**
 * Onboarding-flaggor som "Återställ introduktion" nollställer. Koncept-guiden vid
 * login (seen-concept-walkthrough) + en handplockad uppsättning kontextuella tips
 * för de icke-uppenbara vallgravs-funktionerna (butikssortering, dubbletter,
 * dra rätter mellan dagar, "Jag handlar"-realtid). Medvetet KORT lista — de
 * gamla 26 spridda tipsen är fimpade.
 * Keep names aligned with the keys passed to useOnceFlag(...) in each tip site.
 */
export const TIP_FLAGS = [
  'seen-concept-walkthrough',
  'seen-stores-tip',
  'seen-merge-tip',
  'seen-menu-drag-tip',
  'seen-shopper-tip',
] as const;

/** Special master flag — kvar för bakåtkompat (dormant SpotlightTip-infra). */
export const SKIP_ALL_FLAG = 'onboarding-skip-all';
