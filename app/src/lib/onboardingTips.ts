/**
 * Onboarding-flaggor som "Återställ introduktion" nollställer. Koncept-guiden vid
 * login (seen-concept-walkthrough) + en handplockad uppsättning kontextuella tips
 * för de icke-uppenbara vallgravs-funktionerna (butikssortering, dubbletter).
 * Medvetet KORT lista — de gamla 26 spridda tipsen är fimpade, och
 * "Jag handlar"-tipset togs bort: det var en instruktion i ord om var i
 * ⋮-menyn knappen låg, utan något att peka på.
 * Keep names aligned with the keys passed to useOnceFlag(...) in each tip site.
 */
export const TIP_FLAGS = [
  'seen-concept-walkthrough',
  'seen-stores-tip',
  'seen-merge-tip',
] as const;

/** Special master flag — kvar för bakåtkompat (dormant SpotlightTip-infra). */
export const SKIP_ALL_FLAG = 'onboarding-skip-all';
