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
  /** Ett steg fick fokus (eller växte). Får knappen "Lägg till steg" så att
   *  skärmen kan skrolla den ovanför tangentbordet. */
  onStepFocus?: (addButton: View | null) => void;
  /** Ett nytt steg skapas. Knappen flyttas ned `extra` px när det renderats —
   *  skärmen kan skrolla dit direkt, i en enda rörelse, i stället för att
   *  vänta på fokus (då hann iOS skrolla själv först och det hoppade). */
  onStepAdded?: (addButton: View | null, extra: number) => void;
  /** Inget steg har fokus längre. */
  onStepBlur?: () => void;
};

// Varje steg i ett eget numrerat fält. Enter avslutar steget och öppnar nästa;
// backsteg i ett tomt steg tar bort det och går tillbaka till föregående.
// Förr var det ett enda textfält där varje radbrytning blev ett steg, vilket
// testare inte förstod förrän de sett läsvyn.
export function StepsEditor({ value, onChange, onStepFocus, onStepAdded, onStepBlur }: Props) {
  const { colors: c, ny } = useTheme();
  const s = useMemo(() => makeStyles(c, ny), [c, ny]);
  const [steps, setSteps] = useState(() => splitSteps(value));
  const refs = useRef<(TextInput | null)[]>([]);
  const pendingFocus = useRef<number | null>(null);
  const addBtnRef = useRef<View>(null);
  // Vilket steg som har fokus. Blur väntar en stund: när Enter flyttar fokus
  // till nästa steg ska skärmen inte hinna tro att inget steg är fokuserat.
  const focusedIdx = useRef<number | null>(null);

  function stepFocused(idx: number) {
    focusedIdx.current = idx;
    onStepFocus?.(addBtnRef.current);
  }

  function stepBlurred(idx: number) {
    setTimeout(() => {
      if (focusedIdx.current !== idx) return;
      focusedIdx.current = null;
      onStepBlur?.();
    }, 150);
  }

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
    onStepAdded?.(addBtnRef.current, NEW_STEP_HEIGHT);
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
            onFocus={() => stepFocused(idx)}
            onBlur={() => stepBlurred(idx)}
            // Ett långt steg som radbryts flyttar ned knappen — håll den synlig.
            onContentSizeChange={() => { if (focusedIdx.current === idx) onStepFocus?.(addBtnRef.current); }}
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
      <View ref={addBtnRef} collapsable={false}>
        <Pressable style={s.addBtn} onPress={() => addAfter(steps.length - 1)}>
          <Ionicons name="add" size={16} color={c.primary} />
          <Text style={s.addBtnText}>{str.detail.addStep}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Ett tomt steg: fältets minHeight + avståndet mellan raderna.
const STEP_MIN_HEIGHT = 48;
const STEP_GAP = 10;
const NEW_STEP_HEIGHT = STEP_MIN_HEIGHT + STEP_GAP;

const makeStyles = (c: Palette, ny: NyPalett) => StyleSheet.create({
  list: { gap: STEP_GAP },
  // Samma nummerbricka som läsvyns steg, så redigeringen ser ut som resultatet.
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  num: { width: 28, height: 28, borderRadius: 14, backgroundColor: ny.skog, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  numText: { width: 24, textAlign: 'center', fontFamily: nyFont.halvfet, fontSize: 13, color: ny.lime },
  input: {
    flex: 1, minHeight: STEP_MIN_HEIGHT, borderWidth: 1, borderColor: c.border, borderRadius: 10,
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, fontSize: 16,
    backgroundColor: c.inputBg, color: c.text, textAlignVertical: 'top',
  },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  addBtnText: { fontSize: 14, color: c.primary, fontWeight: '500' },
});
