import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { ActivityIndicator, Keyboard, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BankStore } from '@veckis/shared';
import { useApiClient } from '../api/client';
import { useNy } from '../context/ThemeContext';
import { nyFont, type NyPalett } from '../lib/nyDesign';
import { getApproxPosition } from '../lib/position';
import { reportClientError } from '../lib/errorReport';
import { storeMeta } from '../lib/storeMeta';
import { stores as storesStr } from '../lib/svenska';

const str = storesStr.bank;

/**
 * Sök fram sin butik i butiksbanken (OpenStreetMap), med närmaste först.
 *
 * Ordet i sökfältet matchas i valfri ordning mot namn, kedja, gata och ort, så
 * "orminge coop" hittar Stora Coop Orminge. Position går före postnummer:
 * "Butiker nära mig" frågar om ungefärlig plats, och säger man nej — eller
 * saknar appen platstjänst — finns postnumret.
 *
 * Används både när en butik skapas och när en befintlig kopplas.
 */
export function StoreBankPicker({
  initialQuery = '',
  onPick,
  onCreateOwn,
  busy = false,
  onFocusInput,
  onUnlink,
  existing,
}: {
  initialQuery?: string;
  onPick: (store: BankStore) => void;
  /** Visar "Skapa egen butik" — utelämnas där det inte är ett val. */
  onCreateOwn?: (name: string) => void;
  busy?: boolean;
  /** Från useSheetLift, så fälten lyfts över tangentbordet i arket. */
  onFocusInput?: (ref: RefObject<TextInput | null>) => () => void;
  /** Visar "Ingen av dessa — ta bort kopplingen" när butiken redan är kopplad. */
  onUnlink?: () => void;
  /** Bankbutiker som redan finns i hushållet (bankens id → hushållets butik).
   *  De märks "Redan tillagd"; vad ett tryck gör avgör onPick. */
  existing?: Record<string, { id: string; name: string }>;
}) {
  const client = useApiClient();
  const ny = useNy();
  const s = useMemo(() => makeStyles(ny), [ny]);

  const [q, setQ] = useState(initialQuery);
  const [postcode, setPostcode] = useState('');
  const [position, setPosition] = useState<{ lat: number; lon: number } | null>(null);
  const [platsStatus, setPlatsStatus] = useState<'idle' | 'locating' | 'denied' | 'unavailable'>('idle');
  const [kanFrågaIgen, setKanFrågaIgen] = useState(true);
  const [träffar, setTräffar] = useState<BankStore[]>([]);
  const [attribution, setAttribution] = useState<string | null>(null);
  const [söker, setSöker] = useState(false);
  const [sökfel, setSökfel] = useState(false);
  const sökRef = useRef<TextInput>(null);
  const { height: windowHeight } = useWindowDimensions();
  const [kbHöjd, setKbHöjd] = useState(0);
  useEffect(() => {
    // Höjden kan rapporteras som 0 under edge-to-edge (se useSheetLift) —
    // då antas 40 % av skärmen, så listan ändå krymper.
    const visa = Keyboard.addListener('keyboardDidShow', e => setKbHöjd(e.endCoordinates?.height || windowHeight * 0.4));
    const göm = Keyboard.addListener('keyboardDidHide', () => setKbHöjd(0));
    return () => { visa.remove(); göm.remove(); };
  }, [windowHeight]);
  const postRef = useRef<TextInput>(null);

  const pnSiffror = postcode.replace(/\D/g, '');
  const harPostnummer = pnSiffror.length === 5;
  const harNågot = q.trim().length >= 2 || !!position || harPostnummer;

  // Sök med en kort paus efter varje ändring, och släng svar som hunnit bli
  // inaktuella medan man skrev vidare.
  useEffect(() => {
    if (!harNågot) { setTräffar([]); return; }
    let aktuell = true;
    const t = setTimeout(async () => {
      setSöker(true);
      try {
        const svar = await client.searchStoreBank({
          q: q.trim() || undefined,
          ...(position ? { lat: position.lat, lon: position.lon } : harPostnummer ? { postcode: pnSiffror } : {}),
        });
        if (!aktuell) return;
        setTräffar(svar.stores);
        setAttribution(svar.attribution);
        setSökfel(false);
      } catch {
        if (aktuell) setSökfel(true);
      } finally {
        if (aktuell) setSöker(false);
      }
    }, 300);
    return () => { aktuell = false; clearTimeout(t); };
  }, [q, position, harPostnummer, pnSiffror, harNågot, client]);

  async function hämtaPosition() {
    setPlatsStatus('locating');
    try {
      const r = await getApproxPosition();
      if (r.status === 'ok') {
        setPosition({ lat: r.lat, lon: r.lon });
        setPlatsStatus('idle');
      } else {
        if (r.status === 'denied') setKanFrågaIgen(r.canAskAgain);
        setPlatsStatus(r.status);
      }
    } catch (e) {
      // Ska inte kunna hända — getApproxPosition fångar själv. Men "Nära mig"
      // har gett en grå skärm en gång, så ett fel här ska lämna spår i
      // adminloggen i stället för att försvinna.
      reportClientError('Butiksbank: positionen kastade', { message: e instanceof Error ? e.message : String(e) });
      setPlatsStatus('unavailable');
    }
  }

  const visaPostnummer = platsStatus === 'denied' || platsStatus === 'unavailable' || (!position && postcode !== '');

  // Träffarna ligger OVANFÖR sökfältet: arket lyfts bara så mycket att det
  // fokuserade fältet syns (useSheetLift), så en lista under fältet hamnade
  // bakom tangentbordet och gick inte att se utan att stänga det. Med
  // tangentbordet uppe krymper listan till det som får plats ovanför.
  const listaMax = kbHöjd > 0 ? Math.max(140, Math.min(320, windowHeight - kbHöjd - 300)) : 320;

  const sökfält = (<>
      <View style={s.platsRad}>
        {!position ? (
          <Pressable style={s.platsKnapp} onPress={hämtaPosition} disabled={platsStatus === 'locating'} accessibilityRole="button">
            {platsStatus === 'locating'
              ? <ActivityIndicator size="small" color={ny.padYta} />
              : <Ionicons name="navigate-outline" size={16} color={ny.padYta} />}
            <Text style={s.platsKnappText}>{platsStatus === 'locating' ? str.locating : str.useLocation}</Text>
          </Pressable>
        ) : (
          <View style={[s.platsKnapp, s.platsKnappAktiv]}>
            <Ionicons name="navigate" size={16} color={ny.skog} />
            <Text style={[s.platsKnappText, { color: ny.skog }]}>{str.useLocation}</Text>
          </View>
        )}
        {!position && (
          <TextInput
            ref={postRef}
            onFocus={onFocusInput?.(postRef)}
            style={s.postFält}
            value={postcode}
            onChangeText={setPostcode}
            placeholder={str.postcodePlaceholder}
            placeholderTextColor={ny.textDampad}
            keyboardType="number-pad"
            maxLength={6}
          />
        )}
      </View>
      {visaPostnummer && platsStatus !== 'idle' && platsStatus !== 'locating' && (
        <View style={s.platsInfoRad}>
          <Text style={s.platsInfo}>{platsStatus === 'denied' ? str.locationDenied : str.locationUnavailable}</Text>
          {/* Nej för gott: bara telefonens inställningar kan ändra det. */}
          {platsStatus === 'denied' && !kanFrågaIgen && Platform.OS !== 'web' && (
            <Pressable onPress={() => { void Linking.openSettings(); }} hitSlop={8}>
              <Text style={s.platsLänk}>{str.openSettings}</Text>
            </Pressable>
          )}
        </View>
      )}
      <View style={s.sökRad}>
        <Ionicons name="search" size={18} color={ny.textDampad} />
        <TextInput
          ref={sökRef}
          onFocus={onFocusInput?.(sökRef)}
          style={s.sökFält}
          value={q}
          onChangeText={setQ}
          placeholder={str.searchPlaceholder}
          placeholderTextColor={ny.textDampad}
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>
  </>);

  return (
    <View style={s.root}>
      <ScrollView style={[s.lista, { maxHeight: listaMax }]} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
        {söker && träffar.length === 0 && <ActivityIndicator style={{ marginVertical: 16 }} color={ny.padYta} />}
        {träffar.map(t => {
          const meta = storeMeta(t);
          return (
            <Pressable key={t.id} style={s.rad} onPress={() => onPick(t)} disabled={busy} accessibilityRole="button">
              <View style={s.radIkon}><Ionicons name="storefront-outline" size={18} color={ny.padYta} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.radNamn} numberOfLines={1}>{t.name}</Text>
                {!!meta.locality && <Text style={s.radMeta} numberOfLines={1}>{meta.locality}</Text>}
                {!!meta.address && <Text style={s.radMeta} numberOfLines={1}>{meta.address}</Text>}
              </View>
              {existing?.[t.id]
                ? <Text style={s.radRedan}>{str.alreadyTag}</Text>
                : t.distanceKm != null && <Text style={s.radAvstånd}>{str.distance(t.distanceKm)}</Text>}
            </Pressable>
          );
        })}
        {harNågot && !söker && träffar.length === 0 && !sökfel && <Text style={s.tomt}>{str.noResults}</Text>}
        {sökfel && <Text style={s.tomt}>{str.errorSearch}</Text>}
      </ScrollView>

      {onCreateOwn && (
        <Pressable style={s.egen} onPress={() => onCreateOwn(q.trim())} disabled={busy} accessibilityRole="button">
          <Ionicons name="add-circle-outline" size={18} color={ny.padYta} />
          <Text style={s.egenText} numberOfLines={1}>{q.trim() ? str.createOwn(q.trim()) : str.createOwnEmpty}</Text>
        </Pressable>
      )}
      {onUnlink && (
        <Pressable style={s.egen} onPress={onUnlink} disabled={busy} accessibilityRole="button">
          <Ionicons name="close-circle-outline" size={18} color={ny.textDampad} />
          <Text style={[s.egenText, { color: ny.textDampad }]} numberOfLines={2}>{str.unlinkInPicker}</Text>
        </Pressable>
      )}
      {/* ODbL kräver att källan anges där datan visas. */}
      {attribution && träffar.length > 0 && <Text style={s.attribution}>{str.attribution}</Text>}
      {sökfält}
    </View>
  );
}

const makeStyles = (ny: NyPalett) => StyleSheet.create({
  root: { gap: 10 },
  sökRad: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 48, borderRadius: 14, borderWidth: 1, borderColor: ny.kontur, backgroundColor: ny.bakgrund },
  sökFält: { flex: 1, fontSize: 16, color: ny.text, padding: 0 },
  platsRad: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  platsKnapp: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: ny.ljus, borderWidth: 1, borderColor: ny.kontur },
  platsKnappAktiv: { backgroundColor: ny.lime, borderColor: ny.lime },
  platsKnappText: { fontSize: 14, fontWeight: '600', color: ny.padYta },
  postFält: { width: 120, height: 40, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: ny.kontur, backgroundColor: ny.bakgrund, fontSize: 15, color: ny.text },
  platsInfoRad: { gap: 4 },
  platsInfo: { fontSize: 13, color: ny.textDampad },
  platsLänk: { fontSize: 14, fontWeight: '600', color: ny.padYta },
  lista: {},
  rad: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: ny.kontur },
  radIkon: { width: 36, height: 36, borderRadius: 18, backgroundColor: ny.bricka, alignItems: 'center', justifyContent: 'center' },
  radNamn: { fontFamily: nyFont.halvfet, fontSize: 15, color: ny.text },
  radMeta: { fontSize: 13, color: ny.textDampad, marginTop: 1 },
  radAvstånd: { fontSize: 13, fontWeight: '600', color: ny.padYta, minWidth: 56, textAlign: 'right' },
  // Explicit bredd: Android klipper annars "Redan tillagd" efter första ordet.
  radRedan: { fontSize: 12, fontWeight: '700', color: ny.textDampad, width: 92, textAlign: 'right' },
  tomt: { fontSize: 14, color: ny.textDampad, paddingVertical: 14, textAlign: 'center' },
  egen: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  egenText: { flex: 1, fontSize: 15, fontWeight: '600', color: ny.padYta },
  attribution: { fontSize: 11, color: ny.textDampad, textAlign: 'right' },
});
