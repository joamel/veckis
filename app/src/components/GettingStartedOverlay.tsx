import { useState, useEffect, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../lib/theme';
import { useHousehold } from '../context/HouseholdContext';
import { useApiClient } from '../api/client';
import { useOnceFlag } from '../hooks/useOnceFlag';
import { requestSpotlight } from '../lib/spotlightRequest';
import { gettingStarted as str } from '../lib/svenska';

interface Status { hasRecipes: boolean; hasStore: boolean; hasMenu: boolean; hasList: boolean }

/**
 * Global "Kom igång"-overlay: en hopfällbar pill i nedre vänstra hörnet (följer
 * med mellan flikar, äter inte header-utrymme). Tryck → expanderar till check-
 * listan. Steg-tryck = opt-in guidning (navigerar + tänder spotlight på kontrollen
 * via spotlightRequest). Statusen (fyra bools) hämtas här (best-effort), listan
 * döljs när allt är klart eller när man stänger den. Renderas i (tabs)/_layout.
 */
export function GettingStartedOverlay() {
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { householdId } = useHousehold();
  const client = useApiClient();
  const { seen, markSeen } = useOnceFlag('seen-getting-started');
  const [status, setStatus] = useState<Status | null>(null);
  const [expanded, setExpanded] = useState(false);

  const refresh = useCallback(async () => {
    if (!householdId) return;
    try {
      const [recs, stores, lists, menus] = await Promise.all([
        client.getRecipes(householdId).catch(() => []),
        client.getStores(householdId).catch(() => []),
        client.getShoppingLists(householdId).catch(() => []),
        client.getAllMenus(householdId).catch(() => []),
      ]);
      setStatus({ hasRecipes: recs.length > 0, hasStore: stores.length > 0, hasList: lists.length > 0, hasMenu: menus.length > 0 });
    } catch { /* best-effort — overlayn får aldrig störa appen */ }
  }, [householdId, client]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (seen !== false || !householdId || !status) return null;
  const flags = [status.hasRecipes, status.hasStore, status.hasMenu, status.hasList];
  const doneCount = flags.filter(Boolean).length;
  if (doneCount === 4) return null;

  const steps = [
    { key: 'recipe', icon: 'restaurant-outline' as const, label: str.steps.recipe, done: status.hasRecipes, go: () => { requestSpotlight('gs-recipe'); router.push('/recipes' as never); } },
    { key: 'store', icon: 'storefront-outline' as const, label: str.steps.store, done: status.hasStore, go: () => { requestSpotlight('gs-store'); router.push('/stores' as never); } },
    { key: 'menu', icon: 'calendar-outline' as const, label: str.steps.menu, done: status.hasMenu, go: () => { requestSpotlight('gs-menu'); router.push('/menu' as never); } },
    { key: 'list', icon: 'cart-outline' as const, label: str.steps.list, done: status.hasList, go: () => { requestSpotlight('gs-list'); router.push('/shopping' as never); } },
  ];
  const anchorBottom = insets.bottom + 62; // ovanför flik-raden

  if (!expanded) {
    return (
      <Pressable
        style={[s.pill, { bottom: anchorBottom }]}
        onPress={() => { setExpanded(true); void refresh(); }}
        accessibilityRole="button"
        accessibilityLabel={`${str.title} ${str.progress(doneCount, 4)}`}
      >
        <Text style={s.pillText}>🎯 {str.title} {str.progress(doneCount, 4)}</Text>
      </Pressable>
    );
  }

  return (
    <View style={[s.card, { bottom: anchorBottom }]}>
      <View style={s.header}>
        <Text style={s.title}>{str.title} {str.progress(doneCount, 4)}</Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => setExpanded(false)} hitSlop={10} accessibilityLabel={str.collapse}>
          <Ionicons name="chevron-down" size={20} color={c.textFaint} />
        </Pressable>
        <Pressable onPress={markSeen} hitSlop={10} accessibilityLabel={str.close} style={{ marginLeft: 10 }}>
          <Ionicons name="close" size={20} color={c.textFaint} />
        </Pressable>
      </View>
      <Text style={s.subtitle}>{str.subtitle}</Text>
      {steps.map(step => (
        <Pressable
          key={step.key}
          style={s.item}
          onPress={step.done ? undefined : () => { setExpanded(false); step.go(); }}
          disabled={step.done}
          accessibilityRole="button"
          accessibilityState={{ disabled: step.done }}
        >
          <Ionicons name={step.done ? 'checkmark-circle' : step.icon} size={20} color={step.done ? c.success : c.primary} />
          <Text style={[s.itemLabel, step.done && s.itemLabelDone]}>{step.label}</Text>
          {step.done
            ? <Text style={s.doneTag}>{str.done}</Text>
            : <Ionicons name="chevron-forward" size={16} color={c.textFaint} />}
        </Pressable>
      ))}
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  pill: {
    position: 'absolute',
    left: 12,
    backgroundColor: c.primary,
    borderRadius: 22,
    paddingVertical: 9,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  pillText: { color: '#fff', fontWeight: '700', fontSize: 13.5 },
  card: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: c.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '700', color: c.text },
  subtitle: { fontSize: 12.5, color: c.textMuted, marginTop: 2, marginBottom: 4 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: c.borderLight,
  },
  itemLabel: { flex: 1, fontSize: 14, color: c.text },
  itemLabelDone: { color: c.textFaint, textDecorationLine: 'line-through' },
  doneTag: { fontSize: 12, color: c.success, fontWeight: '600' },
});
