/**
 * Master list of onboarding tip flags. Add new entries here when introducing
 * additional tips so the dev-only "reset onboarding" button clears them all.
 * Keep names aligned with the keys passed to useOnceFlag(...) in each tip site.
 */
export const TIP_FLAGS = [
  'seen-forgiving-tip',
  'seen-menu-nav-tip',
  'seen-merge-tip',
  'seen-templates-tip',
  'seen-recipes-btn-tip',
  'seen-cart-fab-tip',
  'seen-list-actions-tip',
  'seen-sort-tip',
  'seen-weeknav-date-tip',
  'seen-filter-tip',
  'seen-notif-clock-tip',
  'seen-drag-merge-tip',
  'seen-recipe-cart-tip',
  'seen-admin-tip',
  'seen-stores-tip',
] as const;
