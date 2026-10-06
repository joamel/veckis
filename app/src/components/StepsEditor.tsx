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
  /** Ett nytt steg har renderats. Skärmen skrollar fram knappen; det nya
   *  steget får fokus först efter REVEAL_MS, när skrollningen är klar. */
  onStepAdded?: (addButton: View | null) => void;
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
  const addBtnRef = useRef<View>(null);
  // Vilket steg som har fokus. Blur väntar en stund: när fokus flyttas till
  // nästa steg ska skärmen inte hinna tro att inget steg är fokuserat.
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

  function commit(next: string[]) {
    setSteps(next);
    onChange(joinSteps(next));
  }

  // Nytt steg: rendera det, skrolla fram det med den VERKLIGA höjden, och
  // flytta fokus först när skrollningen är klar. Fick det nya fältet fokus
  // medan skrollningen pågick låg det bakom tangentbordet en stund — då
  // panorerade Android hela fönstret (softwareKeyboardLayoutMode "pan") och
  // sedan tillbaka: vyn blinkade till från toppen och avståndet ändrades vid
  // varje steg. Fokus stannar i det gamla steget under tiden, så tangentbordet
  // ligger kvar.
  function revealThenFocus(target: number) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      onStepAdded?.(addBtnRef.current);
      setTimeout(() => refs.current[target]?.focus(), REVEAL_MS);
    }));
  }

  function changeText(idx: number, text: string) {
    const { steps: next, focusIdx } = applyStepText(steps, idx, text);
    if (focusIdx === idx) { commit(next); return; }
    // Radbrytning i ett tomt steg (Enter på webben, vissa tangentbord):
    // inget nytt steg — samma spärr som "nästa".
    if (next.slice(idx, focusIdx + 1).every(x => x.trim() === '')) {
      const kept = [...steps];
      kept[idx] = '';
      commit(kept);
      return;
    }
    commit(next);
    revealThenFocus(focusIdx);
  }

  function addAfter(idx: number) {
    // Spärr: ett tomt steg ger inget nytt — fokus stannar (eller hamnar) i det.
    if (steps[idx].trim() === '') {
      refs.current[idx]?.focus();
      return;
    }
    commit([...steps.slice(0, idx + 1), '', ...steps.slice(idx + 1)]);
    revealThenFocus(idx + 1);
  }

  function removeEmpty(idx: number, e: NativeSyntheticEvent<TextInputKeyPressEventData>) {
    if (e.nativeEvent.key !== 'Backspace' || steps[idx] !== '' || steps.length === 1) return;
    commit(steps.filter((_, i) => i !== idx));
    // Föregående steg ligger ovanför och syns redan — inget att skrolla.
    const prev = Math.max(0, idx - 1);
    requestAnimationFrame(() => refs.current[prev]?.focus());
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

const STEP_MIN_HEIGHT = 48;
const STEP_GAP = 10;
// Ungefär en animerad scrollTo — fokus väntar tills den är klar.
const REVEAL_MS = 320;

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
