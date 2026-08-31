import { forwardRef } from 'react';
import { View, TextInput, Pressable, type TextInputProps, type ViewStyle, type StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { common } from '../lib/svenska';

type Props = TextInputProps & {
  value: string;
  onChangeText: (t: string) => void;
  /** Layout för wrappern (t.ex. flex:1 när fältet ligger i en rad). */
  containerStyle?: StyleProp<ViewStyle>;
};

/**
 * TextInput med en "x"-knapp INNANFÖR fältet längst till höger som snabbrensar
 * texten. Wrappern är en rad, fältet flex:1, x:et absolut-positionerat till höger
 * (vertikalt centrerat på en rad, uppe till höger på multiline). Använd ALDRIG på
 * lösenordsfält. Fältets padding-right lämnar plats för x:et.
 */
export const ClearableInput = forwardRef<TextInput, Props>(function ClearableInput(
  { value, onChangeText, style, containerStyle, multiline, ...props }, ref,
) {
  const { colors: c } = useTheme();
  const show = value.length > 0;
  return (
    <View style={[{ flexDirection: 'row', alignItems: multiline ? 'flex-start' : 'center' }, containerStyle]}>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        placeholderTextColor={c.textFaint}
        style={[style, { flex: 1, paddingRight: 34 }]}
        {...props}
      />
      {show && (
        <Pressable
          onPress={() => onChangeText('')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={common.actions.clearSearch}
          style={{ position: 'absolute', right: 8, top: multiline ? 12 : 0, bottom: multiline ? undefined : 0, justifyContent: 'center', paddingHorizontal: 2 }}
        >
          <Ionicons name="close-circle" size={18} color={c.textFaint} />
        </Pressable>
      )}
    </View>
  );
});
