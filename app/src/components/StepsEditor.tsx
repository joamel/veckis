import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View, type NativeSyntheticEvent, type TextInputKeyPressEventData } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from './Pressable';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../lib/theme';
import { nyFont, type NyPalett } from '../lib/nyDesign';
import { applyStepText, joinSteps, splitSteps } from '../lib/recipeSteps';
import { recipes as str } from '../lib/svenska';

type Props = {
  /** Stegen som en text, ett steg per rad — samma form som sparas. */
  value: string;
  onChange: (text: string) => void;
};

// Varje steg i ett eget numrerat fält. Enter avslutar steget och öppnar nästa;
// backsteg i ett tomt steg tar bort det och går tillbaka till föregående.
// Förr var det ett enda textfält där varje radbrytning blev ett steg, vilket
// testare inte förstod förrän de sett läsvyn.
export function StepsEditor({ value, onChange }: Props) {
  const { colors: c, ny } = useTheme();
  const s = useMemo(() => makeStyles(c, ny), [c, ny]);
  const [steps, setSteps] = useState(() => splitSteps(value));
  const refs = useRef<(TextInput | null)[]>([]);
  const pendingFocus = useRef<number | null>(null);

  // Texten kan bytas utifrån (utkast som återställs, import som fyller i) —
  // då gäller den. Egna ändringar ger samma text och rör inte fälten.
  useEffect(() => {
    if (value !== joinSteps(steps)) setSteps(splitSteps(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Fokus flyttas efter att det nya fältet hunnit renderas.
  useEffect(() => {
    if (pendingFocus.current == null) return;
    refs.current[pendingFocus.current]?.focus();
    pendingFocus.current = null;
  });

  function commit(next: string[], focusIdx?: number) {
    setSteps(next);
    if (focusIdx != null) pendingFocus.current = focusIdx;
    onChange(joinSteps(next));
  }

  function changeText(idx: number, text: string) {
    const { steps: next, focusIdx } = applyStepText(steps, idx, text);
    commit(next, focusIdx !== idx ? focusIdx : undefined);
  }

  function addAfter(idx: number) {
    const next = [...steps.slice(0, idx + 1), '', ...steps.slice(idx + 1)];
    commit(next, idx + 1);
  }

  function removeEmpty(idx: number, e: NativeSyntheticEvent<TextInputKeyPressEventData>) {
    if (e.nativeEvent.key !== 'Backspace' || steps[idx] !== '' || steps.length === 1) return;
    commit(steps.filter((_, i) => i !== idx), Math.max(0, idx - 1));
  }

  return (
    <View style={s.list}>
      {steps.map((step, idx) => (
        <View key={idx} style={s.row}>
          <View style={s.num}>
            <Text style={s.numText}>{idx + 1}</Text>
          </View>
          <TextInput
            ref={el => { refs.current[idx] = el; }}
            style={s.input}
            value={step}
            onChangeText={text => changeText(idx, text)}
            onKeyPress={e => removeEmpty(idx, e)}
            placeholder={idx === 0 ? str.detail.stepFirstPlaceholder : str.detail.stepPlaceholder}
            placeholderTextColor={c.textFaint}
            accessibilityLabel={str.detail.stepA11y(idx + 1)}
            // Radbryts när steget är långt, men Enter betyder "nästa steg".
            // submitBehavior gäller native; webben använder blurOnSubmit.
            multiline
            submitBehavior="submit"
            blurOnSubmit
            returnKeyType="next"
            onSubmitEditing={() => addAfter(idx)}
          />
        </View>
      ))}
      <Pressable style={s.addBtn} onPress={() => addAfter(steps.length - 1)}>
        <Ionicons name="add" size={16} color={c.primary} />
        <Text style={s.addBtnText}>{str.detail.addStep}</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (c: Palette, ny: NyPalett) => StyleSheet.create({
  list: { gap: 10 },
  // Samma nummerbricka som läsvyns steg, så redigeringen ser ut som resultatet.
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  num: { width: 28, height: 28, borderRadius: 14, backgroundColor: ny.skog, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  numText: { width: 24, textAlign: 'center', fontFamily: nyFont.halvfet, fontSize: 13, color: ny.lime },
  input: {
    flex: 1, minHeight: 48, borderWidth: 1, borderColor: c.border, borderRadius: 10,
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, fontSize: 16,
    backgroundColor: c.inputBg, color: c.text, textAlignVertical: 'top',
  },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  addBtnText: { fontSize: 14, color: c.primary, fontWeight: '500' },
});
