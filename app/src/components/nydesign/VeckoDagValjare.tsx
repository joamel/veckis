import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { MealType, WeekDay } from '@veckis/shared';
import { useNy, useTheme } from '../../context/ThemeContext';
import { nyFont, type NyPalett } from '../../lib/nyDesign';
import { common, recipes as receptStr } from '../../lib/svenska';
import { dayItemsSummary } from '../../lib/menuDaySummary';
import { getISOWeek, addWeeks, getISOWeekMonday } from '../../lib/week';

const MENU_DAYS: { key: WeekDay; label: string }[] =
  (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as WeekDay[])
    .map((key, i) => ({ key, label: common.weekdays.long[i] }));

/** Hur många veckor framåt man kan planera in i. */
const ANTAL_VECKOR = 5;

export interface PlanerbarRatt {
  day: WeekDay | null;
  mealType: MealType | null;
  recipe: { title: string };
}

/**
 * Innehållet i "Lägg till i meny": en rad veckobrickor och veckans sju dagar
 * med det som redan är planerat.
 *
 * Bodde tidigare i TVÅ skärmar med var sin uppsättning stilar — receptlistan
 * och receptvyn — och receptvyns hade aldrig gjorts om till den nya designen.
 * Samma ark ska se likadant ut oavsett var man öppnar det ifrån, så vyn är en
 * komponent i stället för en kopia.
 *
 * Komponenten äger INTE arket runtomkring: anroparen renderar sin egen
 * DraggableBottomSheet, eftersom rubrik, undertitel och stängning skiljer.
 */
export function VeckoDagValjare({ veckoStr, onValjVecka, veckansRatter, onValjDag }: {
  /** Vald vecka, "2026-39". */
  veckoStr: string;
  onValjVecka: (veckoStr: string) => void;
  /** Rätterna i den valda veckan — visas som hint på respektive dag. */
  veckansRatter: PlanerbarRatt[];
  onValjDag: (day: WeekDay) => void;
}) {
  const { scheme } = useTheme();
  const ny = useNy();
  const mork = scheme === 'dark';
  const s = useMemo(() => gorSt(ny, mork), [ny, mork]);

  const veckor = useMemo(() => {
    const idag = getISOWeek(new Date());
    const mandag = getISOWeekMonday(idag.weekYear, idag.weekNumber);
    return Array.from({ length: ANTAL_VECKOR }, (_, i) => {
      const mon = addWeeks(mandag, i);
      const { weekYear, weekNumber } = getISOWeek(mon);
      return {
        nyckel: `${weekYear}-${String(weekNumber).padStart(2, '0')}`,
        etikett: i === 0 ? receptStr.menu.weekNow(weekNumber) : receptStr.menu.weekLabel(weekNumber),
        datum: `${mon.getDate()}/${mon.getMonth() + 1}`,
      };
    });
  }, []);

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.veckoScroll}>
        <View style={s.veckoRad}>
          {veckor.map(v => {
            const vald = veckoStr === v.nyckel;
            return (
              <Pressable
                key={v.nyckel}
                style={[s.veckoChip, vald && s.veckoChipVald]}
                onPress={() => onValjVecka(v.nyckel)}
                accessibilityRole="button"
                accessibilityState={{ selected: vald }}
              >
                <Text style={[s.veckoText, vald && s.veckoTextVald]}>{v.etikett}</Text>
                <Text style={[s.veckoDatum, vald && s.veckoTextVald]}>{v.datum}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={s.dagar}>
        {MENU_DAYS.map(d => {
          const dagens = veckansRatter.filter(m => m.day === d.key);
          return (
            <Pressable key={d.key} style={s.dag} onPress={() => onValjDag(d.key)} accessibilityRole="button">
              <Text style={s.dagNamn}>{d.label}</Text>
              {dagens.length > 0 && (
                <Text style={s.dagHint} numberOfLines={1}>{dayItemsSummary(dagens)}</Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

const gorSt = (ny: NyPalett, mork: boolean) => StyleSheet.create({
  veckoScroll: { marginBottom: -4 },
  veckoRad: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  // Samma form som taggfiltret i receptlistan: en ram som fylls när man
  // väljer. I mörkt läge är ramen lime — skog-grönt mot skog-grönt syns inte.
  veckoChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, alignItems: 'center',
    borderWidth: 1, borderColor: mork ? ny.lime : ny.kontur,
  },
  veckoChipVald: mork
    ? { backgroundColor: ny.lime, borderColor: ny.lime }
    : { backgroundColor: ny.skog, borderColor: ny.skog },
  veckoText: { fontFamily: nyFont.halvfet, fontSize: 14, color: ny.chipText },
  veckoTextVald: { color: mork ? ny.skog : ny.lime },
  veckoDatum: { fontSize: 11, color: ny.textDampad, marginTop: 2 },
  dagar: { gap: 8, marginTop: 4 },
  // Samma gröna yta som receptens kompakta rader — arket ska kännas som en
  // lista av kort, inte som ett formulär.
  dag: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    paddingVertical: 14, paddingHorizontal: 16, backgroundColor: ny.kort, borderRadius: 16,
  },
  dagNamn: { fontFamily: nyFont.fet, fontWeight: 'normal', fontSize: 16, letterSpacing: -0.3, color: ny.padYta },
  dagHint: { fontFamily: nyFont.halvfet, fontSize: 13, color: ny.textDampad, flexShrink: 1, marginLeft: 8, textAlign: 'right' },
});
