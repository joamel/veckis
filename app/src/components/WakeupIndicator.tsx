import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../lib/theme';
// "Vaknar..."-banner som visas när första API-anropet tar > 3 sek.
// Backenden kör på Render free-tier som sover efter 15 min inaktivitet
// — första request kan ta 20-30 sek att vakna. Utan denna såg appen
// trasig ut för användaren.
//
// Banner är passiv och tystas så fort något lyckat svar kommer.
// Visar inte vid efterföljande anrop i samma session — vaken är vaken.
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ActivityIndicator } from 'react-native';
import { subscribeBackendWakeup } from '../lib/backendWakeup';
import { components as str } from '../lib/svenska';

export function WakeupIndicator() {
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    return subscribeBackendWakeup(state => {
      setVisible(state === 'waking');
    });
  }, []);

  if (!visible) return null;

  return (
    <View style={s.banner}>
      <ActivityIndicator size="small" color="#fff" />
      <Text style={s.text}>{str.wakeupIndicator.text}</Text>
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: c.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    zIndex: 9998,
  },
  text: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '600' },
});
