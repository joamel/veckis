import { useMemo, useRef, useState, type RefObject } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNy } from '../context/ThemeContext';
import type { NyPalett } from '../lib/nyDesign';
import { components } from '../lib/svenska';

const str = components.shoppingListPicker;

/**
 * Välj inköpslista och bekräfta med Överför — samma ruta överallt där något
 * förs över till en lista (menyguiden, en enskild rätt, receptvyn). Förut såg
 * de olika ut, receptvyn förde över redan vid tryck på en lista, och en ny
 * lista gick bara att skapa när det inte fanns någon alls.
 *
 * "+ Ny inköpslista" fäller ut ett namnfält; den skapade listan blir vald, och
 * överföringen sker först när man trycker Överför.
 */
export function ShoppingListPicker({
  lists,
  selectedId,
  onSelect,
  onCreate,
  onConfirm,
  confirming = false,
  confirmDisabled = false,
  onFocusInput,
  compact = false,
}: {
  lists: Array<{ id: string; name: string }>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Skapar listan och ger tillbaka den; den väljs sedan automatiskt. */
  onCreate: (name: string) => Promise<{ id: string } | null>;
  onConfirm: (listId: string) => void;
  confirming?: boolean;
  /** T.ex. när inga ingredienser är valda. */
  confirmDisabled?: boolean;
  /** Från useSheetLift, så namnfältet lyfts över tangentbordet i arket. */
  onFocusInput?: (ref: RefObject<TextInput | null>) => () => void;
  /** Tätare rader — för receptets ark, där ingredienslistan ovanför ska få
   *  det mesta av höjden. */
  compact?: boolean;
}) {
  const ny = useNy();
  const s = useMemo(() => makeStyles(ny), [ny]);
  const [creatingOpen, setCreatingOpen] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const nameRef = useRef<TextInput>(null);
  const showNameField = creatingOpen || lists.length === 0;

  async function create() {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const list = await onCreate(trimmed);
      if (list) {
        onSelect(list.id);
        setName('');
        setCreatingOpen(false);
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <View style={s.root}>
      {lists.map(l => {
        const selected = selectedId === l.id;
        return (
          <Pressable
            key={l.id}
            style={[s.item, compact && s.itemCompact, selected && s.itemActive, confirming && s.disabled]}
            onPress={() => onSelect(l.id)}
            disabled={confirming}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
          >
            {/* Bara namnet: hur många varor listan redan har säger inget om
                vart man vill föra över. */}
            <Text style={[s.itemTitle, { flex: 1 }]} numberOfLines={1}>{l.name}</Text>
            {selected && <Ionicons name="checkmark-circle" size={22} color={ny.padYta} />}
          </Pressable>
        );
      })}

      {showNameField ? (
        <View style={s.createBlock}>
          {lists.length === 0 && <Text style={s.emptyText}>{str.noLists}</Text>}
          <View style={s.createRow}>
            <TextInput
              ref={nameRef}
              onFocus={onFocusInput?.(nameRef)}
              style={s.input}
              placeholder={str.namePlaceholder}
              placeholderTextColor={ny.textDampad}
              value={name}
              onChangeText={setName}
              returnKeyType="done"
              onSubmitEditing={create}
              autoFocus={creatingOpen}
            />
            <Pressable
              style={[s.createBtn, (!name.trim() || creating) && s.disabled]}
              onPress={create}
              disabled={creating || !name.trim()}
              accessibilityRole="button"
            >
              {creating ? <ActivityIndicator color={ny.skog} size="small" /> : <Text style={s.createBtnText}>{str.create}</Text>}
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable style={[s.newRow, compact && s.newRowCompact]} onPress={() => setCreatingOpen(true)} disabled={confirming} accessibilityRole="button">
          <Ionicons name="add-circle-outline" size={20} color={ny.padYta} />
          <Text style={s.newRowText}>{str.newList}</Text>
        </Pressable>
      )}

      <Pressable
        style={[s.confirm, compact && s.confirmCompact, (!selectedId || confirming || confirmDisabled) && s.disabled]}
        onPress={() => selectedId && onConfirm(selectedId)}
        disabled={!selectedId || confirming || confirmDisabled}
        accessibilityRole="button"
      >
        {confirming ? <ActivityIndicator color={ny.skog} size="small" /> : <Text style={s.confirmText}>{str.transfer}</Text>}
      </Pressable>
    </View>
  );
}

// Samma utseende som menyguidens liststeg, som var det användaren ville ha.
const makeStyles = (ny: NyPalett) => StyleSheet.create({
  root: { gap: 0 },
  item: { paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: ny.kontur, flexDirection: 'row', alignItems: 'center' },
  itemActive: { backgroundColor: ny.bricka, borderRadius: 10, borderBottomColor: 'transparent' },
  itemCompact: { paddingVertical: 10 },
  newRowCompact: { paddingVertical: 10 },
  confirmCompact: { marginTop: 8, paddingVertical: 12 },
  itemTitle: { fontSize: 16, fontWeight: '600', color: ny.text },
  disabled: { opacity: 0.4 },
  newRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 12 },
  newRowText: { fontSize: 16, fontWeight: '600', color: ny.padYta },
  createBlock: { gap: 8, paddingVertical: 10 },
  emptyText: { fontSize: 14, color: ny.textDampad, textAlign: 'center' },
  createRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: { flex: 1, color: ny.text, borderWidth: 1, borderColor: ny.kontur, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: ny.bakgrund },
  createBtn: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: ny.lime, borderRadius: 14 },
  createBtnText: { fontSize: 14, color: ny.skog, fontWeight: '600' },
  confirm: { marginTop: 12, backgroundColor: ny.lime, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  confirmText: { color: ny.skog, fontSize: 16, fontWeight: '600' },
});
