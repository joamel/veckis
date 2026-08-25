/**
 * Onboarding-flaggor som "Återställ introduktion" nollställer. Sedan de spridda
 * spotlight-tipsen pensionerades (ersatta av koncept-guiden vid login) är det
 * bara guide-flaggan som är aktiv — nollställning gör att guiden visas igen.
 * Keep names aligned with the keys passed to useOnceFlag(...) in each tip site.
 */
export const TIP_FLAGS = [
  'seen-concept-walkthrough',
] as const;

/** Special master flag — kvar för bakåtkompat (dormant SpotlightTip-infra). */
export const SKIP_ALL_FLAG = 'onboarding-skip-all';
