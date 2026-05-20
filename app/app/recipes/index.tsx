import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApiClient, type RecipeWithIngredients } from '../../src/api/client';
import { useHousehold } from '../../src/context/HouseholdContext';

export default function RecipesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ create?: string; forMenuDay?: string }>();
  const createTriggeredRef = useRef(false);
  const client = useApiClient();
  const { householdId } = useHousehold();
  const [recipes, setRecipes] = useState<RecipeWithIngredients[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredRecipes = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return recipes;
    return recipes.filter(r =>
      r.title.toLowerCase().includes(q) ||
      r.ingredients.some(i => i.name.toLowerCase().includes(q))
    );
  }, [recipes, searchQuery]);

  // New recipe form
  const [mode, setMode] = useState<'manual' | 'url'>('manual');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [scraping, setScraping] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!householdId) return;
    try {
      setRecipes(await client.getRecipes(householdId));
    } catch {
      Alert.alert('Fel', 'Kunde inte ladda recept');
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  useFocusEffect(useCallback(() => { load(); return () => setEditMode(false); }, [load]));

  async function handleScrape() {
    if (!url.trim()) return;
    const normalizedUrl = url.trim().replace(/\/$/, '');
    const existing = recipes.find(r => r.sourceUrl?.replace(/\/$/, '') === normalizedUrl);
    if (existing) {
      Alert.alert(
        'Recept finns redan',
        `"${existing.title}" har redan hämtats från den här URL:en.`,
        [
          { text: 'Avbryt', style: 'cancel' },
          { text: 'Öppna receptet', onPress: () => { setShowModal(false); router.push(`/recipes/${existing.id}` as never); } },
        ]
      );
      return;
    }
    setScraping(true);
    try {
      const scraped = await client.scrapeRecipe(url.trim());
      if (!householdId) return;
      setCreating(true);
      const recipe = await client.createRecipe({
        householdId,
        title: scraped.title,
        description: scraped.description,
        sourceUrl: url.trim(),
        imageUrl: scraped.imageUrl,
        servings: scraped.servings,
        ingredients: scraped.ingredients.map(i => ({ name: i.name, quantity: i.quantity, unit: i.unit })),
      });
      setRecipes(prev => [...prev, recipe].sort((a, b) => a.title.localeCompare(b.title)));
      setShowModal(false);
      setUrl('');
      router.push(`/recipes/${recipe.id}` as never);
    } catch (err) {
      Alert.alert('Fel', err instanceof Error ? err.message : 'Kunde inte hämta recept från URL');
    } finally {
      setScraping(false);
      setCreating(false);
    }
  }

  async function handleCreateManual() {
    if (!householdId || !title.trim()) return;
    setCreating(true);
    try {
      const recipe = await client.createRecipe({ householdId, title: title.trim() });
      setRecipes(prev => [...prev, recipe].sort((a, b) => a.title.localeCompare(b.title)));
      setShowModal(false);
      setTitle('');
      const forMenuDay = params.forMenuDay;
      const suffix = forMenuDay !== undefined ? `&forMenuDay=${forMenuDay}` : '';
      router.push(`/recipes/${recipe.id}?edit=1${suffix}` as never);
    } catch {
      Alert.alert('Fel', 'Kunde inte skapa recept');
    } finally {
      setCreating(false);
    }
  }

  // Auto-open create modal when navigated with ?create=1
  useEffect(() => {
    if (params.create === '1' && !createTriggeredRef.current) {
      createTriggeredRef.current = true;
      openModal();
      router.setParams({ create: undefined });
    }
    if (params.create !== '1') createTriggeredRef.current = false;
  }, [params.create]);

  function openModal() {
    setMode('manual');
    setTitle('');
    setUrl('');
    setShowModal(true);
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#4f46e5" /></View>;
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="arrow-back" size={26} color="#111827" />
          </Pressable>
          <Text style={s.title}>Recept</Text>
        </View>
        <View style={s.searchRow}>
          <Ionicons name="search" size={16} color="#9ca3af" style={s.searchIcon} />
          <TextInput
            style={s.searchInput}
            placeholder="Sök på namn eller ingrediens…"
            placeholderTextColor="#9ca3af"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color="#9ca3af" />
            </Pressable>
          )}
        </View>
      </View>

      <FlatList
        data={filteredRecipes}
        keyExtractor={r => r.id}
        contentContainerStyle={[s.list, filteredRecipes.length === 0 && s.listEmpty]}
        onRefresh={load}
        refreshing={loading}
        ListEmptyComponent={
          <View style={s.emptyContainer}>
            <Ionicons name={searchQuery ? 'search-outline' : 'book-outline'} size={56} color="#d1d5db" />
            <Text style={s.emptyText}>{searchQuery ? 'Inga träffar' : 'Inga recept än'}</Text>
            <Text style={s.emptySubtext}>{searchQuery ? `Inget recept matchar "${searchQuery}"` : 'Lägg till manuellt eller via en URL'}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={s.cardWrap}>
            <Pressable
              style={s.card}
              onPress={() => { if (!editMode) router.push(`/recipes/${item.id}` as never); }}
              onLongPress={() => setEditMode(true)}
            >
              <View style={s.cardIcon}>
                <Ionicons name="restaurant-outline" size={20} color="#4f46e5" />
              </View>
              <View style={s.cardContent}>
                <Text style={s.cardTitle}>{item.title}</Text>
                <Text style={s.cardMeta}>{item.servings} port · {item.ingredients.length} ingredienser</Text>
              </View>
              {!editMode && <Ionicons name="chevron-forward" size={18} color="#d1d5db" />}
            </Pressable>
            {editMode && (
              <Pressable
                style={s.cardDeleteBtn}
                onPress={() =>
                  Alert.alert('Ta bort recept', `Ta bort "${item.title}"?`, [
                    { text: 'Avbryt', style: 'cancel' },
                    { text: 'Ta bort', style: 'destructive', onPress: async () => {
                      try {
                        await client.deleteRecipe(item.id);
                        setRecipes(prev => prev.filter(r => r.id !== item.id));
                      } catch { Alert.alert('Fel', 'Kunde inte ta bort receptet'); }
                    }},
                  ])
                }
              >
                <Ionicons name="remove-circle" size={22} color="#ef4444" />
              </Pressable>
            )}
          </View>
        )}
      />

      {editMode ? (
        <Pressable style={s.editDoneBtn} onPress={() => setEditMode(false)}>
          <Text style={s.editDoneBtnText}>Klar</Text>
        </Pressable>
      ) : (
        <Pressable style={s.fab} onPress={openModal}>
          <Ionicons name="add" size={30} color="#fff" />
        </Pressable>
      )}

      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <Pressable style={s.overlay} onPress={() => setShowModal(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end' }} pointerEvents="box-none">
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>Nytt recept</Text>

          <View style={s.modeTabs}>
            <Pressable style={[s.modeTab, mode === 'manual' && s.modeTabActive]} onPress={() => setMode('manual')}>
              <Text style={[s.modeTabText, mode === 'manual' && s.modeTabTextActive]}>Manuellt</Text>
            </Pressable>
            <Pressable style={[s.modeTab, mode === 'url' && s.modeTabActive]} onPress={() => setMode('url')}>
              <Text style={[s.modeTabText, mode === 'url' && s.modeTabTextActive]}>Från URL</Text>
            </Pressable>
          </View>

          {mode === 'manual' ? (
            <>
              <TextInput
                style={s.input}
                placeholder="Receptets namn"
                placeholderTextColor="#9ca3af"
                value={title}
                onChangeText={setTitle}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleCreateManual}
              />
              <Pressable
                style={[s.button, !title.trim() && s.buttonDisabled]}
                onPress={handleCreateManual}
                disabled={creating || !title.trim()}
              >
                {creating ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Skapa recept</Text>}
              </Pressable>
            </>
          ) : (
            <>
              <TextInput
                style={s.input}
                placeholder="https://tasteline.com/recept/..."
                placeholderTextColor="#9ca3af"
                value={url}
                onChangeText={setUrl}
                autoCapitalize="none"
                keyboardType="url"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleScrape}
              />
              <Text style={s.urlHint}>Fungerar med de flesta receptsajter (ICA, Arla, Tasteline, m.fl.)</Text>
              <Pressable
                style={[s.button, !url.trim() && s.buttonDisabled]}
                onPress={handleScrape}
                disabled={scraping || creating || !url.trim()}
              >
                {scraping || creating
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.buttonText}>Hämta recept</Text>}
              </Pressable>
            </>
          )}
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 20, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 12 },
  title: { fontSize: 28, fontWeight: '700', color: '#111827' },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, gap: 6 },
  searchIcon: { marginRight: 2 },
  searchInput: { flex: 1, fontSize: 15, color: '#111827', padding: 0 },
  list: { padding: 16, gap: 10 },
  listEmpty: { flex: 1 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#374151', marginTop: 16 },
  emptySubtext: { fontSize: 14, color: '#9ca3af', marginTop: 6 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  cardIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  cardMeta: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center', shadowColor: '#4f46e5', shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, gap: 14 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb', alignSelf: 'center', marginBottom: 4 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  modeTabs: { flexDirection: 'row', backgroundColor: '#f3f4f6', borderRadius: 10, padding: 4 },
  modeTab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  modeTabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  modeTabText: { fontSize: 14, fontWeight: '500', color: '#6b7280' },
  modeTabTextActive: { color: '#111827' },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 14, fontSize: 16, backgroundColor: '#f9fafb' },
  urlHint: { fontSize: 12, color: '#9ca3af', marginTop: -6 },
  button: { backgroundColor: '#4f46e5', borderRadius: 10, padding: 16, alignItems: 'center' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cardWrap: { position: 'relative' },
  cardDeleteBtn: { position: 'absolute', top: -9, right: -9, zIndex: 10, backgroundColor: '#fff', borderRadius: 11 },
  editDoneBtn: { position: 'absolute', bottom: 32, alignSelf: 'center', backgroundColor: '#111827', borderRadius: 24, paddingHorizontal: 28, paddingVertical: 12 },
  editDoneBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
