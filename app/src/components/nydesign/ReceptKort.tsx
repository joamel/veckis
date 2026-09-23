import { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { nyFont, type NyPalett } from '../../lib/nyDesign';
import { useNy } from '../../context/ThemeContext';
import { platshallare, type PlatshallarTon } from '../../lib/receptPlatshallare';
import { recipes as str } from '../../lib/svenska';

/** Hur kortet beter sig — speglar receptlistans lägen. */
export type ReceptKortLage = 'normal' | 'redigera' | 'valj' | 'planera';

interface Props {
  id: string;
  titel: string;
  /** Titel + taggar — styr platshållarens ikon när receptet saknar bild. */
  sokord: string;
  /** Färdig metatext för bildkortet, där bandet har plats för ord. */
  meta: string;
  /** Kompakta raden visar siffrorna med ikon i stället — bestick för
   *  portioner, matikon för ingredienser. Tre korta grupper tar mindre
   *  plats än "4 port · 12 ingredienser" och läses lika snabbt. */
  portioner: number;
  ingredienser: number;
  /** Tillagningstid, färdigformaterad ("45 min"). null = okänd, ingen bricka. */
  tid: string | null;
  bildUrl: string | null;
  lage: ReceptKortLage;
  onPress: () => void;
  /** Kvar för redigeraläget; LISTAN skickar inget långtryck längre — ett recept
   *  ska inte gå att radera av misstag med ett tryck som hålls kvar. */
  onLongPress?: () => void;
  onPlanera: () => void;
  onTaBort: () => void;
  planeraLabel: string;
  taBortLabel: string;
}

/** Pinterest-kort i murverket. Med bild: titeln på ett halvgenomskinligt
 *  grönt band, så den syns även på ljusa bilder. Utan bild: ljus eller mörk
 *  grön yta med en matikon. */
export function ReceptBildkort({ hojd, ...p }: Props & { hojd: number }) {
  const ny = useNy();
  const st = useMemo(() => gorSt(ny), [ny]);
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
          <Ionicons name={ph!.ikon} size={76} color={mork ? ny.ytIkonMork : ny.ytIkon} style={[st.ikonStor, p.tid && st.ikonUnderTid]} />
        )}
        {/* Tiden i övre vänstra hörnet, mitt emot planera-knappen: den är
            beslutsunderlag och ska synas innan man läst titeln. */}
        {p.tid && (
          <View style={st.tidBricka}>
            <Ionicons name="time-outline" size={13} color={ny.lime} />
            <Text style={[st.tidBrickaText, { width: tidBredd(p.tid, 7) }]} numberOfLines={1}>{p.tid}</Text>
          </View>
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
  const ny = useNy();
  const st = useMemo(() => gorSt(ny), [ny]);
  // Samma gröna som rubrikerna inne i receptet (ny.padYta): mörkgrön mot den
  // ljusa raden, mjukt limegrön mot den mörka. Dämpad grå försvann nästan i
  // mörkt läge, och ren lime blev skrikig bredvid rubrikerna.
  const metaFarg = ny.padYta;
  const ph = p.bildUrl ? null : platshallare(p.id, p.sokord);
  const mork = ph?.ton === 'mork';
  return (
    <View>
      <Pressable style={st.rad} onPress={p.onPress} onLongPress={p.onLongPress}>
        {p.bildUrl ? (
          <Image source={{ uri: p.bildUrl }} style={st.tumnagel} resizeMode="cover" />
        ) : (
          <View style={[st.tumnagel, st.tumnagelTom, mork ? st.ytaMork : st.ytaLjusRad]}>
            <Ionicons name={ph!.ikon} size={28} color={mork ? ny.lime : ny.padYta} />
          </View>
        )}
        {/* Tiden står på METARADEN, inte till höger om titeln: där åt den av
            bredden och kortade rubriken i onödan. */}
        <View style={st.radText}>
          <Text style={st.radTitel} numberOfLines={2}>{p.titel}</Text>
          <View style={st.radMetaRad}>
            {p.tid && (
              <MetaTal
                ikon={<Ionicons name="time-outline" size={13} color={metaFarg} />}
                text={p.tid} farg={metaFarg} beskrivning={str.card.a11yTid(p.tid)}
              />
            )}
            <MetaTal
              ikon={<Ionicons name="restaurant-outline" size={13} color={metaFarg} />}
              text={String(p.portioner)} farg={metaFarg} beskrivning={str.card.a11yPortioner(p.portioner)}
            />
            <MetaTal
              ikon={<MaterialCommunityIcons name="fruit-grapes-outline" size={14} color={metaFarg} />}
              text={String(p.ingredienser)} farg={metaFarg} beskrivning={str.card.a11yIngredienser(p.ingredienser)}
            />
          </View>
        </View>
        {p.lage === 'normal' && (
          <Pressable style={st.radKnapp} onPress={p.onPlanera} hitSlop={6} accessibilityRole="button" accessibilityLabel={p.planeraLabel}>
            <Ionicons name="calendar-outline" size={18} color={ny.lime} />
          </Pressable>
        )}
        {p.lage === 'valj' && <Ionicons name="add-circle" size={26} color={ny.padYta} />}
        {p.lage === 'planera' && <Ionicons name="calendar-outline" size={20} color={ny.padYta} />}
      </Pressable>
      {p.lage === 'redigera' && <TaBortKnapp {...p} />}
    </View>
  );
}

/** Ikon + siffra, tätt ihop. Explicit bredd på texten: Android mäter korta
 *  texter för smalt och klipper sista tecknet (se android-text-clipping). */
function MetaTal({ ikon, text, farg, beskrivning }: {
  /** Färdig ikon, inte ett namn: ingrediensikonen kommer ur ett annat paket
   *  än de andra två (Ionicons har ingen grönsak i kontur). */
  ikon: React.ReactNode;
  text: string;
  farg: string;
  beskrivning: string;
}) {
  const ny = useNy();
  const st = useMemo(() => gorSt(ny), [ny]);
  return (
    <View style={st.metaTal} accessible accessibilityLabel={beskrivning}>
      {ikon}
      <Text style={[st.radMeta, { color: farg, width: tidBredd(text, 7) }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

function Hornknapp(p: Props & { ton?: PlatshallarTon }) {
  const ny = useNy();
  const st = useMemo(() => gorSt(ny), [ny]);
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

/** Explicit bredd på tidstexten — Android mäter korta texter för smalt och
 *  klipper sista glyfen ("45 min" → "45 mi"). */
function tidBredd(tid: string, perTecken: number): number {
  return Math.ceil(tid.length * perTecken) + 4;
}

function TaBortKnapp(p: Props) {
  const ny = useNy();
  const st = useMemo(() => gorSt(ny), [ny]);
  return (
    <Pressable style={st.taBort} onPress={p.onTaBort} hitSlop={6} accessibilityRole="button" accessibilityLabel={p.taBortLabel}>
      <Ionicons name="remove-circle" size={24} color="#ef4444" />
    </Pressable>
  );
}

const gorSt = (ny: NyPalett) => StyleSheet.create({
  bildkort: { borderRadius: 20, overflow: 'hidden', backgroundColor: ny.skogMellan },
  ytaMork: { backgroundColor: ny.skogMellan },
  ytaLjus: { backgroundColor: ny.platsLjus },
  ikonStor: { position: 'absolute', top: 12, left: 12 },
  // Platshållarikonen flyttas ned när tidsbrickan tar övre vänstra hörnet.
  ikonUnderTid: { top: 46 },
  tidBricka: {
    position: 'absolute', top: 11, left: 11, flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, height: 26, borderRadius: 13, backgroundColor: ny.bandOverlay,
  },
  tidBrickaText: { fontSize: 12, fontWeight: '700', color: '#ffffff' },
  hornknapp: {
    position: 'absolute', top: 9, right: 9, width: 36, height: 36, borderRadius: 18,
    backgroundColor: ny.lime, alignItems: 'center', justifyContent: 'center',
  },
  hornknappMork: { backgroundColor: ny.hornMorkYta },
  // Bandet täcker hela kortets bredd; kortets rundade hörn klipper det.
  band: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10, gap: 2,
    backgroundColor: ny.bandOverlay,
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
  ytaLjusRad: { backgroundColor: ny.platsLjus },
  radText: { flex: 1, gap: 2 },
  radTitel: { fontFamily: nyFont.fet, fontSize: 16, lineHeight: 20, letterSpacing: -0.3, color: ny.text },
  radMetaRad: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  metaTal: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  radMeta: { fontSize: 12, color: ny.textDampad, flexShrink: 1 },
  radTidText: { fontWeight: '700', flexShrink: 0 },
  // Mörkgrön knapp med limegrön ikon, samma par som de stora korten och
  // "Laga"-knappen. Den ljusa brickan såg ut som en yta, inte som något man
  // trycker på, och ikonen i metafärg smälte ihop med siffrorna bredvid.
  radKnapp: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: ny.skog,
    alignItems: 'center', justifyContent: 'center',
  },
  taBort: { position: 'absolute', top: -9, right: -9, zIndex: 10, backgroundColor: ny.ljus, borderRadius: 12 },
});
