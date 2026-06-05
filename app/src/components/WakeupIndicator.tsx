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

export function WakeupIndicator() {
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
      <Text style={s.text}>Servern vaknar… det här tar ofta 10–20 sek första gången.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#7c3aed',
    paddingHorizontal: 14,
    paddingVertical: 10,
    zIndex: 9998,
  },
  text: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '600' },
});
