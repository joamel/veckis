import { useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApiClient, type ShoppingListWithItems } from '../../src/api/client';
import { useHousehold } from '../../src/context/HouseholdContext';
import { useHaptics } from '../../src/hooks/useHaptics';

export default function ShoppingScreen() {
  const router = useRouter();
  const client = useApiClient();
  const { householdId, householdName, householdEmoji } = useHousehold();
  const { medium } = useHaptics();
  const [lists, setLists] = useState<ShoppingListWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!householdId) return;
    try {
      const data = await client.getShoppingLists(householdId);
      setLists(data);
    } catch {
      Alert.alert('Fel', 'Kunde inte ladda inköpslistor');
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function createList() {
    if (!householdId || !newListName.trim()) return;
    setCreating(true);
    try {
      const list = await client.createShoppingList({ householdId, name: newListName.trim() });
      setShowModal(false);
      setNewListName('');
      router.push(`/shopping/${list.id}` as never);
    } catch {
      Alert.alert('Fel', 'Kunde inte skapa lista');
    } finally {
      setCreating(false);
    }
  }

  async function deleteList(listId: string, listName: string) {
    Alert.alert('Ta bort lista', `Ta bort "${listName}"?`, [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Ta bort',
        style: 'destructive',
        onPress: async () => {
          try {
            await client.deleteShoppingList(listId);
            setLists(prev => prev.filter(l => l.id !== listId));
          } catch {
            Alert.alert('Fel', 'Kunde inte ta bort lista');
          }
        },
      },
    ]);
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#4f46e5" /></View>;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Inköp</Text>
          {householdName && <Text style={styles.subtitle}>{householdEmoji || '🏠'} {householdName}</Text>}
        </View>
      </View>

      <FlatList
        data={lists}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.list, lists.length === 0 && styles.listEmpty]}
        onRefresh={load}
        refreshing={loading}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="cart-outline" size={56} color="#d1d5db" />
            <Text style={styles.emptyText}>Inga aktiva listor</Text>
            <Text style={styles.emptySubtext}>Tryck på + för att skapa en ny lista</Text>
          </View>
        }
        renderItem={({ item }) => {
          const unchecked = item.items.filter(i => !i.isChecked).length;
          const total = item.items.length;
          return (
            <Pressable
              style={styles.card}
              onPress={() => router.push(`/shopping/${item.id}` as never)}
              onLongPress={() => { medium(); deleteList(item.id, item.name); }}
            >
              <View style={styles.cardLeft}>
                <Ionicons name="cart-outline" size={20} color="#4f46e5" />
              </View>
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.cardMeta}>
                  {item.store ? `${item.store.name} · ` : ''}
                  {total === 0 ? 'Tom' : unchecked === 0 ? 'Allt bockat' : `${unchecked} av ${total} kvar`}
                </Text>
              </View>
              {unchecked === 0 && total > 0 && (
                <Ionicons name="checkmark-circle" size={20} color="#10b981" />
              )}
              <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
            </Pressable>
          );
        }}
      />

      <Pressable style={styles.fab} onPress={() => setShowModal(true)}>
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>

      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowModal(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Ny inköpslista</Text>
            <TextInput
              style={styles.input}
              placeholder="Listans namn, t.ex. ICA fredag"
              value={newListName}
              onChangeText={setNewListName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={createList}
            />
            <Pressable
              style={[styles.button, !newListName.trim() && styles.buttonDisabled]}
              onPress={createList}
              disabled={creating || !newListName.trim()}
            >
              {creating
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>Skapa lista</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    padding: 20,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  title: { fontSize: 28, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  list: { padding: 16, gap: 10 },
  listEmpty: { flex: 1 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#374151', marginTop: 16 },
  emptySubtext: { fontSize: 14, color: '#9ca3af', marginTop: 6 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cardLeft: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  cardMeta: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4f46e5',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    gap: 14,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e5e7eb',
    alignSelf: 'center',
    marginBottom: 4,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    backgroundColor: '#f9fafb',
  },
  button: { backgroundColor: '#4f46e5', borderRadius: 10, padding: 16, alignItems: 'center' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
