import { useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApiClient, type ShoppingListWithItems, type ShoppingItemWithRecipe } from '../../src/api/client';

export default function ShoppingListScreen() {
  const { listId } = useLocalSearchParams<{ listId: string }>();
  const router = useRouter();
  const client = useApiClient();
  const [list, setList] = useState<ShoppingListWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState('');
  const [adding, setAdding] = useState(false);
  const [collapsedRecipes, setCollapsedRecipes] = useState<Set<string>>(new Set());

  function toggleRecipeCollapse(recipeId: string) {
    setCollapsedRecipes(prev => {
      const next = new Set(prev);
      next.has(recipeId) ? next.delete(recipeId) : next.add(recipeId);
      return next;
    });
  }

  const load = useCallback(async () => {
    if (!listId) return;
    try {
      const data = await client.getShoppingList(listId);
      setList(data);
    } catch {
      Alert.alert('Fel', 'Kunde inte ladda listan');
    } finally {
      setLoading(false);
    }
  }, [listId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function addItem() {
    if (!listId || !newItem.trim()) return;
    setAdding(true);
    const name = newItem.trim();
    setNewItem('');
    try {
      const item = await client.addShoppingItem(listId, { name });
      setList(prev => prev ? { ...prev, items: [item, ...prev.items] } : prev);
    } catch {
      setNewItem(name);
      Alert.alert('Fel', 'Kunde inte lägga till vara');
    } finally {
      setAdding(false);
    }
  }

  async function toggleItem(item: ShoppingItem) {
    setList(prev =>
      prev ? { ...prev, items: prev.items.map(i => i.id === item.id ? { ...i, isChecked: !i.isChecked } : i) } : prev
    );
    try {
      const updated = await client.checkShoppingItem(item.id, !item.isChecked);
      setList(prev => prev ? { ...prev, items: prev.items.map(i => i.id === updated.id ? updated : i) } : prev);
    } catch {
      setList(prev =>
        prev ? { ...prev, items: prev.items.map(i => i.id === item.id ? item : i) } : prev
      );
    }
  }

  async function deleteItem(itemId: string) {
    setList(prev => prev ? { ...prev, items: prev.items.filter(i => i.id !== itemId) } : prev);
    try {
      await client.deleteShoppingItem(itemId);
    } catch {
      Alert.alert('Fel', 'Kunde inte ta bort vara');
      load();
    }
  }

  async function completeList() {
    if (!listId) return;
    Alert.alert(
      'Markera klar?',
      'Listan arkiveras och tas bort från vyn.',
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Markera klar',
          onPress: async () => {
            try {
              await client.completeShoppingList(listId);
              router.back();
            } catch {
              Alert.alert('Fel', 'Kunde inte markera listan som klar');
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#4f46e5" /></View>;
  }

  if (!list) return null;

  const unchecked = list.items.filter(i => !i.isChecked);
  const checked = list.items.filter(i => i.isChecked);
  const allItems = [...unchecked, ...checked];

  // Group unchecked items: recipe groups first, then loose items
  const recipeGroups = groupByRecipe(unchecked);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </Pressable>
        <View style={styles.headerMid}>
          <Text style={styles.title} numberOfLines={1}>{list.name}</Text>
          {list.store && <Text style={styles.storeName}>{list.store.name}</Text>}
        </View>
        <Pressable onPress={completeList} style={styles.doneBtn}>
          <Ionicons name="checkmark-done-outline" size={24} color="#4f46e5" />
        </Pressable>
      </View>

      {checked.length > 0 && unchecked.length > 0 && (
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${(checked.length / allItems.length) * 100}%` as `${number}%` }]} />
        </View>
      )}

      <ScrollView contentContainerStyle={[styles.list, allItems.length === 0 && styles.listEmpty]}>
        {allItems.length === 0 && (
          <View style={styles.emptyContainer}>
            <Ionicons name="add-circle-outline" size={48} color="#d1d5db" />
            <Text style={styles.emptyText}>Listan är tom</Text>
            <Text style={styles.emptySubtext}>Lägg till varor nedan</Text>
          </View>
        )}

        {/* Recipe groups (unchecked) */}
        {recipeGroups.map(group => (
          <View key={group.recipeId ?? '__loose'} style={styles.group}>
            {group.recipeId && (
              <Pressable style={styles.groupHeader} onPress={() => toggleRecipeCollapse(group.recipeId!)}>
                <Ionicons name="restaurant-outline" size={14} color="#7c3aed" />
                <Text style={styles.groupTitle}>{group.recipeName}</Text>
                <Text style={styles.groupCount}>{group.items.filter(i => !i.isChecked).length}/{group.items.length}</Text>
                <Ionicons name={collapsedRecipes.has(group.recipeId) ? 'chevron-down' : 'chevron-up'} size={14} color="#9ca3af" />
              </Pressable>
            )}
            {!collapsedRecipes.has(group.recipeId ?? '') && group.items.map(item => (
              <ItemRow key={item.id} item={item} onToggle={() => toggleItem(item)} onDelete={() => deleteItem(item.id)} />
            ))}
          </View>
        ))}

        {/* Checked items */}
        {checked.length > 0 && (
          <>
            <View style={styles.divider}>
              <Text style={styles.dividerText}>Bockat ({checked.length})</Text>
            </View>
            {checked.map(item => (
              <ItemRow key={item.id} item={item} onToggle={() => toggleItem(item)} onDelete={() => deleteItem(item.id)} />
            ))}
          </>
        )}
      </ScrollView>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.addBar}>
          <TextInput
            style={styles.addInput}
            placeholder="Lägg till vara..."
            value={newItem}
            onChangeText={setNewItem}
            returnKeyType="done"
            onSubmitEditing={addItem}
            blurOnSubmit={false}
          />
          <Pressable
            style={[styles.addBtn, (!newItem.trim() || adding) && styles.addBtnDisabled]}
            onPress={addItem}
            disabled={adding || !newItem.trim()}
          >
            {adding
              ? <ActivityIndicator color="#fff" size="small" />
              : <Ionicons name="add" size={22} color="#fff" />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Helper: group items by recipe
function groupByRecipe(items: ShoppingItemWithRecipe[]) {
  const order: string[] = [];
  const map = new Map<string, { recipeId: string | null; recipeName: string | null; items: ShoppingItemWithRecipe[] }>();

  for (const item of items) {
    const key = item.recipeId ?? '__loose';
    if (!map.has(key)) {
      order.push(key);
      map.set(key, { recipeId: item.recipeId, recipeName: item.recipe?.title ?? null, items: [] });
    }
    map.get(key)!.items.push(item);
  }

  // Recipe groups first, loose items last
  const recipeKeys = order.filter(k => k !== '__loose');
  const looseKey = order.includes('__loose') ? ['__loose'] : [];
  return [...recipeKeys, ...looseKey].map(k => map.get(k)!);
}

function ItemRow({ item, onToggle, onDelete }: { item: ShoppingItemWithRecipe; onToggle: () => void; onDelete: () => void }) {
  return (
    <Pressable
      style={[styles.item, item.isChecked && styles.itemChecked]}
      onPress={onToggle}
      onLongPress={() =>
        Alert.alert('Ta bort vara', `Ta bort "${item.name}"?`, [
          { text: 'Avbryt', style: 'cancel' },
          { text: 'Ta bort', style: 'destructive', onPress: onDelete },
        ])
      }
    >
      <Ionicons
        name={item.isChecked ? 'checkbox' : 'square-outline'}
        size={24}
        color={item.isChecked ? '#10b981' : '#4f46e5'}
      />
      <View style={styles.itemContent}>
        <Text style={[styles.itemName, item.isChecked && styles.itemNameChecked]}>{item.name}</Text>
        {(item.quantity !== 1 || item.unit) && (
          <Text style={styles.itemQty}>{item.quantity} {item.unit ?? 'st'}</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    gap: 12,
  },
  backBtn: { padding: 4 },
  doneBtn: { padding: 4 },
  headerMid: { flex: 1 },
  title: { fontSize: 18, fontWeight: '700', color: '#111827' },
  storeName: { fontSize: 12, color: '#6b7280' },
  progressBar: { height: 3, backgroundColor: '#e5e7eb' },
  progressFill: { height: 3, backgroundColor: '#10b981' },
  list: { padding: 16, gap: 6 },
  listEmpty: { flex: 1 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: 17, fontWeight: '600', color: '#374151', marginTop: 12 },
  emptySubtext: { fontSize: 13, color: '#9ca3af', marginTop: 4 },
  divider: { paddingVertical: 10, paddingHorizontal: 4 },
  dividerText: { fontSize: 12, fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  itemChecked: { opacity: 0.6 },
  itemContent: { flex: 1 },
  itemName: { fontSize: 16, color: '#111827' },
  itemNameChecked: { textDecorationLine: 'line-through', color: '#9ca3af' },
  itemQty: { fontSize: 13, color: '#6b7280', marginTop: 1 },
  group: { gap: 4 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 4 },
  groupTitle: { flex: 1, fontSize: 12, fontWeight: '700', color: '#7c3aed', textTransform: 'uppercase', letterSpacing: 0.5 },
  groupCount: { fontSize: 12, color: '#9ca3af' },
  addBar: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    gap: 10,
  },
  addInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#f9fafb',
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnDisabled: { opacity: 0.4 },
});
