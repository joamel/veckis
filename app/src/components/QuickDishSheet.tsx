import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { WeekDay } from '@veckis/shared';
import { Pressable } from './Pressable';
import { DraggableBottomSheet } from './DraggableBottomSheet';
import { VeckoDagValjare, type PlanerbarRatt } from './nydesign/VeckoDagValjare';
import { useTheme } from '../context/ThemeContext';
import { useDesign } from '../context/DesignContext';
import { useSheetLift } from '../hooks/useSheetLift';
import { useApiClient, type WeekMenuItemWithRecipe } from '../api/client';
import { nyFont, type NyPalett } from '../lib/nyDesign';
import type { Palette } from '../lib/theme';
import { menu as str } from '../lib/svenska';

interface Props {
  visible: boolean;
  onClose: () => void;
  householdId: string | null;
  /** Veckan som visas i menyn, "2026-40" — förvald i arket. */
  initialWeek: string;
  /** Alla menyrader, så dagarna kan visa vad som redan är planerat. */
  allMenus: WeekMenuItemWithRecipe[];
  onAdd: (title: string, weekYear: number, weekNumber: number, day: WeekDay) => void;
}

/**
 * Snabbrätt: en rätt i veckomenyn utan recept, bara ett namn. Eget ark i
 * stället för en rad i receptväljaren — ett recept är ett recept, och vanliga
 * rätter ska inte få ett extra steg för det här.
 */
export function QuickDishSheet({ visible, onClose, householdId, initialWeek, allMenus, onAdd }: Props) {
  const { colors: c, ny } = useTheme();
  const { nyDesign } = useDesign();
  const s = useMemo(() => makeStyles(c, nyDesign, ny), [c, nyDesign, ny]);
  const client = useApiClient();
  const { sheetLift, onFocusInput } = useSheetLift();
  const inputRef = useRef<TextInput>(null);
  const [title, setTitle] = useState('');
  const [week, setWeek] = useState(initialWeek);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) return;
    // Ett slängt namn ska inte ligga kvar nästa gång arket öppnas.
    setTitle('');
    setWeek(initialWeek);
    if (householdId) client.getQuickDishTitles(householdId).then(setRecent).catch(() => setRecent([]));
  }, [visible, householdId, initialWeek]);

  const [weekYear, weekNumber] = week.split('-').map(Number);
  const weekItems = useMemo<PlanerbarRatt[]>(
    () => allMenus.filter(m => m.weekYear === weekYear && m.weekNumber === weekNumber),
    [allMenus, weekYear, weekNumber],
  );

  // Förslag som matchar det man skriver; tomt fält visar de senaste.
  const query = title.trim().toLowerCase();
  const suggestions = recent
    .filter(t => (query ? t.toLowerCase().includes(query) && t.toLowerCase() !== query : true))
    .slice(0, 6);

  function pickDay(day: WeekDay) {
    const name = title.trim();
    if (!name) { inputRef.current?.focus(); return; }
    onAdd(name, weekYear, weekNumber, day);
    onClose();
  }

  return (
    <DraggableBottomSheet
      isDirty={title.trim() !== ''}
      visible={visible}
      onRequestClose={onClose}
      liftOffset={sheetLift}
      sheetStyle={s.sheet}
      title={str.quickDish.title}
      subtitle={str.quickDish.subtitle}
    >
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <TextInput
          ref={inputRef}
          onFocus={onFocusInput(inputRef)}
          style={s.input}
          placeholder={str.quickDish.placeholder}
          placeholderTextColor={nyDesign ? ny.textDampad : c.textFaint}
          value={title}
          onChangeText={setTitle}
          maxLength={100}
          autoCapitalize="sentences"
          returnKeyType="done"
          autoFocus
        />
        {suggestions.length > 0 && (
          <View style={s.chips}>
            {suggestions.map(t => (
              <Pressable key={t} style={s.chip} onPress={() => setTitle(t)} accessibilityRole="button">
                <Text style={s.chipText} numberOfLines={1}>{t}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <Text style={s.sectionLabel}>{str.quickDish.chooseDay}</Text>
        <VeckoDagValjare
          veckoStr={week}
          onValjVecka={setWeek}
          veckansRatter={weekItems}
          onValjDag={pickDay}
        />
      </ScrollView>
    </DraggableBottomSheet>
  );
}

const makeStyles = (c: Palette, nyD: boolean, ny: NyPalett) => StyleSheet.create({
  // Bakgrund, rundning, rubrik och padding kommer från DraggableBottomSheet.
  sheet: { maxHeight: '90%' },
  body: { paddingBottom: 16, gap: 10 },
  input: {
    backgroundColor: nyD ? ny.ljus : c.inputBg, borderRadius: nyD ? 14 : 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: nyD ? ny.text : c.text,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    maxWidth: '100%', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
    borderWidth: 1, borderColor: nyD ? ny.kontur : c.border,
  },
  chipText: nyD
    ? { fontFamily: nyFont.halvfet, fontSize: 13, color: ny.chipText }
    : { fontSize: 13, fontWeight: '600', color: c.text },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginTop: 6, marginLeft: 4,
    color: nyD ? ny.textDampad : c.textFaint,
  },
});
