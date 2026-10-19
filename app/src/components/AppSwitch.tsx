import { Switch, type SwitchProps } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useDesign } from '../context/DesignContext';

/**
 * Appens reglage: limegrönt spår med mörkgrön knopp när det är på.
 *
 * Bara spårfärgen räckte inte — knoppen föll då tillbaka på Androids
 * standard, som syntes turkos mot det gröna. Samma utseende överallt, så
 * använd den här i stället för Switch direkt.
 */
export function AppSwitch(props: Omit<SwitchProps, 'trackColor' | 'thumbColor'>) {
  const { colors: c, ny } = useTheme();
  const { nyDesign } = useDesign();
  return (
    <Switch
      {...props}
      trackColor={{ true: nyDesign ? ny.lime : c.primary, false: nyDesign ? ny.kontur : c.border }}
      thumbColor={nyDesign ? (props.value ? ny.skog : ny.ljus) : undefined}
      ios_backgroundColor={nyDesign ? ny.kontur : c.border}
    />
  );
}
