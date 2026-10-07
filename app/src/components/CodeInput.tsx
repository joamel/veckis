// Inbjudningskod som åtta rutor. Ett osynligt TextInput ligger över rutorna och
// tar emot all inmatning — man skriver i ett svep, utan att trycka i varje ruta,
// och kan klistra in både koden och hela inbjudningslänken.
import { forwardRef, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../lib/theme';
import { INVITE_CODE_LENGTH as CODE_LENGTH, normalizeInviteCode } from '../lib/inviteUrl';

export { CODE_LENGTH };

type Props = {
  value: string;
  onChangeText: (code: string) => void;
  onSubmitEditing?: () => void;
  onFocus?: TextInputProps['onFocus'];
  autoFocus?: boolean;
  accessibilityLabel: string;
};

export const CodeInput = forwardRef<TextInput, Props>(function CodeInput(
  { value, onChangeText, onSubmitEditing, onFocus, autoFocus, accessibilityLabel },
  ref,
) {
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const [focused, setFocused] = useState(false);
  const active = Math.min(value.length, CODE_LENGTH - 1);

  return (
    <View style={s.row}>
      {Array.from({ length: CODE_LENGTH }, (_, i) => (
        <View
          key={i}
          style={[
            s.box,
            i === CODE_LENGTH / 2 && s.middleGap,
            focused && i === active && s.boxActive,
          ]}
        >
          <Text style={s.char}>{value[i] ?? ''}</Text>
        </View>
      ))}
      <TextInput
        ref={ref}
        style={s.hiddenInput}
        value={value}
        onChangeText={t => onChangeText(normalizeInviteCode(t))}
        onFocus={e => { setFocused(true); onFocus?.(e); }}
        onBlur={() => setFocused(false)}
        autoFocus={autoFocus}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        importantForAutofill="no"
        caretHidden
        contextMenuHidden={false}
        returnKeyType="done"
        onSubmitEditing={onSubmitEditing}
        accessibilityLabel={accessibilityLabel}
      />
    </View>
  );
});

function makeStyles(c: Palette) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 5,
      alignSelf: 'center',
    },
    box: {
      width: 32,
      height: 44,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      backgroundColor: c.inputBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Två grupper om fyra är lättare att läsa av och skriva in.
    middleGap: { marginLeft: 7 },
    boxActive: { borderColor: c.primary, borderWidth: 2 },
    char: { fontSize: 20, fontWeight: '700', color: c.text },
    // Täcker rutorna så tryck var som helst fokuserar; texten syns bara i rutorna.
    hiddenInput: {
      ...StyleSheet.absoluteFillObject,
      color: 'transparent',
      backgroundColor: 'transparent',
      fontSize: 1,
    },
  });
}
