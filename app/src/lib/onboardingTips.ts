/**
 * Master list of onboarding tip flags. Add new entries here when introducing
 * additional tips so the dev-only "reset onboarding" button clears them all.
 * Keep names aligned with the keys passed to useOnceFlag(...) in each tip site.
 */
export const TIP_FLAGS = [
  'seen-welcome-tip',
  'seen-forgiving-tip',
  'seen-chores-intro-tip',
  'seen-menu-nav-tip',
  'seen-merge-tip',
  'seen-templates-tip',
  'seen-recipes-btn-tip',
  'seen-cart-fab-tip',
  'seen-list-actions-tip',
  'seen-sort-tip',
  'seen-weeknav-date-tip',
  'seen-calendar-swipe-tip',
  'seen-calendar-origins-tip',
  'seen-calendar-add-tip',
  'seen-filter-tip',
  'seen-notif-clock-tip',
  'seen-recipe-cart-tip',
  'seen-recipe-add-tip',
  'seen-shopping-add-tip',
  'seen-suggestion-edit-tip',
  'seen-staple-editor-tip',
  'seen-bulk-recipes-tip',
  'seen-bulk-inventory-tip',
  'seen-admin-tip',
  'seen-stores-tip',
] as const;

/** Special master flag — when set, no tip ever fires (user dismissed welcome
 *  with "Jag är fullärd" / disabled tips in settings). */
export const SKIP_ALL_FLAG = 'onboarding-skip-all';
