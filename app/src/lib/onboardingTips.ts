/**
 * Onboarding-flaggor som "Återställ introduktion" nollställer. Koncept-guiden vid
 * login (seen-concept-walkthrough) + en handplockad uppsättning kontextuella tips
 * för de icke-uppenbara vallgravs-funktionerna (butikssortering, dubbletter,
 * fästa taggar, "Jag handlar").
 * Medvetet KORT lista — de gamla 26 spridda tipsen är fimpade. Det första
 * "Jag handlar"-tipset togs bort när knappen låg i ⋮-menyn (bara ord, inget
 * att peka på); nu ligger knappen i sidhuvudet och tipset pekar på den vid
 * första avbockningen.
 * Keep names aligned with the keys passed to useOnceFlag(...) in each tip site.
 */
export const TIP_FLAGS = [
  'seen-concept-walkthrough',
  'seen-stores-tip',
  'seen-store-order-tip',
  'seen-merge-tip',
  'seen-pin-tag-tip',
  'seen-shopper-tip',
  'seen-list-store-tip',
] as const;

/** Special master flag — kvar för bakåtkompat (dormant SpotlightTip-infra). */
export const SKIP_ALL_FLAG = 'onboarding-skip-all';
