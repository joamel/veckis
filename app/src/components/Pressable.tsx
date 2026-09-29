import { forwardRef } from 'react';
import { Pressable as RNPressable, type PressableProps, type View } from 'react-native';

/** Hur mycket en knapp tonas ned medan fingret är nere. */
const PRESSED_OPACITY = 0.65;

export type Props = PressableProps & {
  /** Ingen nedtoning — där den skulle blinka mitt i en gest (svep-rader,
   *  draghandtag) eller där ytan inte är en knapp. */
  noFeedback?: boolean;
};

/**
 * React Natives Pressable med visuell feedback. Den ger ingen själv, till
 * skillnad från TouchableOpacity: utan feedback kändes en knapp död tills
 * trycket fått effekt, och vid ett nätverksanrop tryckte man igen.
 *
 * Nedtoning snarare än Androids ripple: fungerar likadant i appen och
 * PWA:n, och kräver inte att varje rundad yta klipper sina kanter. Bara ytor
 * som faktiskt gör något vid tryck tonas — en Pressable som bara omsluter
 * innehåll (utan onPress/onLongPress) lämnas som den är.
 */
export const Pressable = forwardRef<View, Props>(function Pressable({ style, noFeedback, ...rest }, ref) {
  const interactive = !!(rest.onPress || rest.onLongPress) && !rest.disabled;
  if (noFeedback || !interactive) return <RNPressable ref={ref} style={style} {...rest} />;
  return (
    <RNPressable
      ref={ref}
      style={state => [
        typeof style === 'function' ? style(state) : style,
        state.pressed && { opacity: PRESSED_OPACITY },
      ]}
      {...rest}
    />
  );
});
