import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { idHash } from '../../lib/receptPlatshallare';

// Höjderna väljs deterministiskt per recept-id i stället för att mätas: då
// hoppar inte korten när bilderna laddar, och samma recept har alltid samma
// form. Variationen är det som ger murverket dess Pinterest-känsla.
const HOJDER = [210, 170, 240, 190, 225, 180];
const HOJD_UTAN_BILD = 150;
const MELLANRUM = 10;

export function murverkHojd(id: string, harBild: boolean): number {
  if (!harBild) return HOJD_UTAN_BILD;
  return HOJDER[idHash(id) % HOJDER.length];
}

/** Två kolumner där varje kort hamnar i den kolumn som för tillfället är
 *  kortast — ordningen läses fortfarande ungefär uppifrån och ned. */
export function Murverk<T>({ items, hojd, nyckel, rendera }: {
  items: T[];
  hojd: (item: T) => number;
  nyckel: (item: T) => string;
  rendera: (item: T, hojd: number) => ReactNode;
}) {
  const kolumner: { item: T; h: number }[][] = [[], []];
  const summa = [0, 0];
  for (const item of items) {
    const h = hojd(item);
    const k = summa[0] <= summa[1] ? 0 : 1;
    kolumner[k].push({ item, h });
    summa[k] += h + MELLANRUM;
  }
  return (
    <View style={st.rad}>
      {kolumner.map((kol, i) => (
        <View key={i} style={st.kolumn}>
          {kol.map(({ item, h }) => <View key={nyckel(item)}>{rendera(item, h)}</View>)}
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  rad: { flexDirection: 'row', gap: MELLANRUM, alignItems: 'flex-start' },
  kolumn: { flex: 1, minWidth: 0, gap: MELLANRUM },
});
