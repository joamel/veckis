import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ny, nyFont } from '../../lib/nyDesign';
import { platshallare, type PlatshallarTon } from '../../lib/receptPlatshallare';

/** Hur kortet beter sig — speglar receptlistans lägen. */
export type ReceptKortLage = 'normal' | 'redigera' | 'valj' | 'planera';

interface Props {
  id: string;
  titel: string;
  /** Titel + taggar — styr platshållarens ikon när receptet saknar bild. */
  sokord: string;
  meta: string;
  bildUrl: string | null;
  lage: ReceptKortLage;
  onPress: () => void;
  onLongPress: () => void;
  onPlanera: () => void;
  onTaBort: () => void;
  planeraLabel: string;
  taBortLabel: string;
}

/** Pinterest-kort i murverket. Med bild: titeln på ett halvgenomskinligt
 *  grönt band, så den syns även på ljusa bilder. Utan bild: ljus eller mörk
 *  grön yta med en matikon. */
export function ReceptBildkort({ hojd, ...p }: Props & { hojd: number }) {
  const ph = p.bildUrl ? null : platshallare(p.id, p.sokord);
  const mork = ph?.ton === 'mork';
  return (
    <View>
      <Pressable
        style={[st.bildkort, { height: hojd }, ph && (mork ? st.ytaMork : st.ytaLjus)]}
        onPress={p.onPress}
        onLongPress={p.onLongPress}
      >
        {p.bildUrl ? (
          <Image source={{ uri: p.bildUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <Ionicons name={ph!.ikon} size={76} color={mork ? 'rgba(205,230,107,0.3)' : 'rgba(29,59,46,0.16)'} style={st.ikonStor} />
        )}
        <Hornknapp {...p} ton={ph?.ton} />
        <View style={p.bildUrl ? st.band : st.textUtanBild}>
          <Text style={[st.titel, ph && !mork && st.titelMorkText]} numberOfLines={3}>{p.titel}</Text>
          <Text style={[st.meta, ph && !mork && st.metaMorkText]} numberOfLines={1}>{p.meta}</Text>
        </View>
      </Pressable>
      {p.lage === 'redigera' && <TaBortKnapp {...p} />}
    </View>
  );
}

/** Kompakt rad: liten bild, titel, meta och planera-knapp. */
export function ReceptKompaktRad(p: Props) {
  const ph = p.bildUrl ? null : platshallare(p.id, p.sokord);
  const mork = ph?.ton === 'mork';
  return (
    <View>
      <Pressable style={st.rad} onPress={p.onPress} onLongPress={p.onLongPress}>
        {p.bildUrl ? (
          <Image source={{ uri: p.bildUrl }} style={st.tumnagel} resizeMode="cover" />
        ) : (
          <View style={[st.tumnagel, st.tumnagelTom, mork ? st.ytaMork : st.ytaLjusRad]}>
            <Ionicons name={ph!.ikon} size={28} color={mork ? ny.lime : ny.skog} />
          </View>
        )}
        <View style={st.radText}>
          <Text style={st.radTitel} numberOfLines={2}>{p.titel}</Text>
          <Text style={st.radMeta} numberOfLines={1}>{p.meta}</Text>
        </View>
        {p.lage === 'normal' && (
          <Pressable style={st.radKnapp} onPress={p.onPlanera} hitSlop={6} accessibilityRole="button" accessibilityLabel={p.planeraLabel}>
            <Ionicons name="calendar-outline" size={18} color={ny.chipText} />
          </Pressable>
        )}
        {p.lage === 'valj' && <Ionicons name="add-circle" size={26} color={ny.skog} />}
        {p.lage === 'planera' && <Ionicons name="calendar-outline" size={20} color={ny.skog} />}
      </Pressable>
      {p.lage === 'redigera' && <TaBortKnapp {...p} />}
    </View>
  );
}

function Hornknapp(p: Props & { ton?: PlatshallarTon }) {
  if (p.lage === 'redigera') return null;
  // Lime syns dåligt mot den ljusa ytan — där blir knappen skog-grön.
  const ljus = p.ton === 'ljus';
  const knappStil = [st.hornknapp, ljus && st.hornknappMork];
  const farg = ljus ? ny.lime : ny.skog;
  const ikon = p.lage === 'valj' ? 'add' : 'calendar-outline';
  // I välj- och planera-läget gör hela kortet jobbet; knappen visar bara vad
  // ett tryck kommer att göra.
  if (p.lage !== 'normal') {
    return <View style={knappStil}><Ionicons name={ikon} size={18} color={farg} /></View>;
  }
  return (
    <Pressable style={knappStil} onPress={p.onPlanera} hitSlop={6} accessibilityRole="button" accessibilityLabel={p.planeraLabel}>
      <Ionicons name={ikon} size={17} color={farg} />
    </Pressable>
  );
}

function TaBortKnapp(p: Props) {
  return (
    <Pressable style={st.taBort} onPress={p.onTaBort} hitSlop={6} accessibilityRole="button" accessibilityLabel={p.taBortLabel}>
      <Ionicons name="remove-circle" size={24} color="#ef4444" />
    </Pressable>
  );
}

const st = StyleSheet.create({
  bildkort: { borderRadius: 20, overflow: 'hidden', backgroundColor: ny.skogMellan },
  ytaMork: { backgroundColor: ny.skogMellan },
  ytaLjus: { backgroundColor: ny.bricka },
  ikonStor: { position: 'absolute', top: 12, left: 12 },
  hornknapp: {
    position: 'absolute', top: 9, right: 9, width: 36, height: 36, borderRadius: 18,
    backgroundColor: ny.lime, alignItems: 'center', justifyContent: 'center',
  },
  hornknappMork: { backgroundColor: ny.skog },
  // Bandet täcker hela kortets bredd; kortets rundade hörn klipper det.
  band: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10, gap: 2,
    backgroundColor: 'rgba(29,59,46,0.8)',
  },
  textUtanBild: { position: 'absolute', left: 12, right: 12, bottom: 11, gap: 2 },
  titel: { fontFamily: nyFont.fet, fontSize: 16, lineHeight: 19, letterSpacing: -0.3, color: '#ffffff' },
  titelMorkText: { color: ny.text },
  meta: { fontSize: 11, color: 'rgba(255,255,255,0.85)' },
  metaMorkText: { color: ny.textDampad },

  rad: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, borderRadius: 18,
    backgroundColor: ny.kort,
  },
  tumnagel: { width: 60, height: 60, borderRadius: 14 },
  tumnagelTom: { alignItems: 'center', justifyContent: 'center' },
  // På den gröntonade raden behövs en tydligare ljus ton än i murverket.
  ytaLjusRad: { backgroundColor: ny.ljus },
  radText: { flex: 1, gap: 2 },
  radTitel: { fontFamily: nyFont.fet, fontSize: 16, lineHeight: 20, letterSpacing: -0.3, color: ny.text },
  radMeta: { fontSize: 12, color: ny.textDampad },
  radKnapp: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: ny.bricka,
    alignItems: 'center', justifyContent: 'center',
  },
  taBort: { position: 'absolute', top: -9, right: -9, zIndex: 10, backgroundColor: ny.ljus, borderRadius: 12 },
});
