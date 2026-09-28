import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Image, PanResponder, PixelRatio, StyleSheet, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';
import {
  fokusEfterDrag,
  klampaZoom,
  maxZoom,
  räknaUtsnitt,
  ärJusterad,
  MITTEN,
  type Bildmått,
  type Ram,
  type Utsnitt,
} from '../lib/bildutsnitt';

export type Fokus = { x: number | null; y: number | null };
/** Hela valet: var bilden ligger och hur inzoomad den är. */
export type Bildval = Fokus & { zoom: number | null };

/** Avståndet mellan två fingrar, eller null om det inte är två. */
function fingeravstånd(e: GestureResponderEvent): number | null {
  const t = e.nativeEvent.touches;
  if (!t || t.length < 2) return null;
  return Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
}

/**
 * Receptbilden i sin 16:9-ram, med valbart utsnitt.
 *
 * Bilden beskärs aldrig som fil — hela originalet ligger kvar och det som
 * sparas är en fokuspunkt och en zoom. Är `justerbar` satt kan man dra i
 * bilden för att välja vilken del som ska synas, och nypa för att zooma in;
 * `onJusterad` anropas när man släpper, så anroparen kan spara. Under tiden måtten är okända visas bilden som vanlig
 * cover, vilket är exakt det utsnitt den hade innan den här komponenten fanns.
 */
export function ReceptBild({
  uri,
  fokusX,
  fokusY,
  zoom = null,
  justerbar = false,
  onJusterad,
  onZoomTak,
  style,
  children,
  onError,
  onLoadStart,
  onLoadEnd,
}: {
  uri: string;
  fokusX: number | null;
  fokusY: number | null;
  /** Inzoomning utöver cover-skalan. null = ingen. */
  zoom?: number | null;
  /** Låter användaren dra och nypa i bilden för att välja utsnitt. */
  justerbar?: boolean;
  /** Anropas när ett drag eller en nypning släpps, med det nya valet. */
  onJusterad?: (val: Bildval) => void;
  /** Hur långt just den här bilden går att zooma, när det är känt — så
   *  anroparens +/−-knappar vet var taket går. */
  onZoomTak?: (tak: number) => void;
  style?: StyleProp<ViewStyle>;
  /** Läggs ovanpå bilden (spinner, felruta, dra-hjälptext …). */
  children?: ReactNode;
  onError?: () => void;
  onLoadStart?: () => void;
  onLoadEnd?: () => void;
}) {
  const [ram, setRam] = useState<Ram | null>(null);
  const [bild, setBild] = useState<Bildmått | null>(null);
  // Valet under pågående gest. Utanför gesten speglar det propsen.
  const [dragVal, setDragVal] = useState<Bildval | null>(null);

  // Måtten behövs bara för ett valt utsnitt eller för att justera. Utan dem
  // blir det vanlig cover, och då slipper varje kort i murverket hämta sin
  // bild en extra gång bara för att mäta den (Image.getSize laddar bilden).
  const needsSize = justerbar || ärJusterad(fokusX, fokusY, zoom);

  // Ny bild → gamla måtten gäller inte, och ett pågående drag hör till den förra.
  useEffect(() => {
    setBild(null);
    setDragVal(null);
    if (!needsSize) return;
    let avbruten = false;
    Image.getSize(
      uri,
      (bredd, höjd) => { if (!avbruten) setBild({ bredd, höjd }); },
      // Går måtten inte att läsa faller vi tillbaka på cover — bilden visas,
      // den går bara inte att justera.
      () => { if (!avbruten) setBild(null); },
    );
    return () => { avbruten = true; };
  }, [uri, needsSize]);

  // Zoomtaket beror på bildens upplösning. Okänt tak = inget tak än; zoomen
  // klampas så fort måtten finns. Bara vid justering: korten får en förminskad
  // bild (cloudinaryOptimized), och taket räknat på den skulle visa ett kort
  // mindre inzoomat än receptet.
  const tak = justerbar && ram && bild ? maxZoom(ram, bild, PixelRatio.get()) : null;
  const onZoomTakRef = useRef(onZoomTak);
  onZoomTakRef.current = onZoomTak;
  useEffect(() => { if (tak !== null) onZoomTakRef.current?.(tak); }, [tak]);

  const val: Bildval = dragVal ?? { x: fokusX, y: fokusY, zoom };
  const zoomNu = tak === null ? klampaZoom(val.zoom) : Math.min(tak, klampaZoom(val.zoom));
  const utsnitt: Utsnitt | null = useMemo(
    () => (ram && bild ? räknaUtsnitt(ram, bild, val.x, val.y, zoomNu) : null),
    [ram, bild, val.x, val.y, zoomNu],
  );

  // Refs så PanResponder (byggs en gång) alltid ser aktuella värden.
  const utsnittRef = useRef<Utsnitt | null>(null);
  utsnittRef.current = utsnitt;
  const valRef = useRef<Bildval>(val);
  valRef.current = { ...val, zoom: zoomNu };
  const takRef = useRef(tak);
  takRef.current = tak;
  const ramRef = useRef(ram);
  ramRef.current = ram;
  const bildRef = useRef(bild);
  bildRef.current = bild;
  // Utgångsläget för det pågående draget. Sätts om varje gång antalet fingrar
  // ändras, annars hoppar bilden när man går från nyp till drag.
  const startRef = useRef<{ val: Bildval; dx: number; dy: number; avstånd: number | null }>({
    val: { x: null, y: null, zoom: null }, dx: 0, dy: 0, avstånd: null,
  });
  const onJusteradRef = useRef(onJusterad);
  onJusteradRef.current = onJusterad;
  const justerbarRef = useRef(justerbar);
  justerbarRef.current = justerbar;

  // Går att ta tag i när det finns något utanför ramen att dra fram, eller
  // när bilden går att zooma.
  const kanDras = !!utsnitt && (utsnitt.överskottX > 1 || utsnitt.överskottY > 1 || (tak ?? 1) > 1);
  const kanDrasRef = useRef(kanDras);
  kanDrasRef.current = kanDras;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Bara när det både är tillåtet och finns något utanför ramen att dra
        // fram — annars skulle ett tryck på bilden fånga gesten i onödan.
        onStartShouldSetPanResponder: () => justerbarRef.current && kanDrasRef.current,
        onMoveShouldSetPanResponder: () => justerbarRef.current && kanDrasRef.current,
        onPanResponderGrant: (e) => {
          startRef.current = { val: valRef.current, dx: 0, dy: 0, avstånd: fingeravstånd(e) };
        },
        onPanResponderMove: (e, gest) => {
          const u = utsnittRef.current;
          if (!u) return;
          const avstånd = fingeravstånd(e);
          // Antalet fingrar har ändrats: börja om från där bilden står nu.
          if ((avstånd === null) !== (startRef.current.avstånd === null)) {
            startRef.current = { val: valRef.current, dx: gest.dx, dy: gest.dy, avstånd };
            return;
          }
          const s = startRef.current;
          if (avstånd !== null && s.avstånd) {
            // Nyp och dra på samma gång: avståndet mellan fingrarna styr zoomen,
            // och när fingrarna flyttas tillsammans följer bilden med —
            // PanResponders dx/dy är mittpunkten mellan dem. Överskottet att
            // dra i räknas för den NYA zoomen, annars flyttar sig bilden olika
            // fort beroende på hur långt man nypt. Taket följer bildens pixlar.
            const ny = klampaZoom(s.val.zoom) * (avstånd / s.avstånd);
            const zoomNy = Math.min(takRef.current ?? ny, klampaZoom(ny));
            const r = ramRef.current;
            const b = bildRef.current;
            const uNy = r && b ? räknaUtsnitt(r, b, s.val.x, s.val.y, zoomNy) : null;
            setDragVal({
              x: uNy ? fokusEfterDrag(s.val.x, gest.dx - s.dx, uNy.överskottX) : s.val.x,
              y: uNy ? fokusEfterDrag(s.val.y, gest.dy - s.dy, uNy.överskottY) : s.val.y,
              zoom: zoomNy,
            });
            return;
          }
          setDragVal({
            x: fokusEfterDrag(s.val.x, gest.dx - s.dx, u.överskottX),
            y: fokusEfterDrag(s.val.y, gest.dy - s.dy, u.överskottY),
            zoom: s.val.zoom,
          });
        },
        onPanResponderRelease: () => {
          const v = valRef.current;
          const z = klampaZoom(v.zoom);
          onJusteradRef.current?.({ x: v.x ?? MITTEN, y: v.y ?? MITTEN, zoom: z > 1 ? z : null });
          // Släpp utkastet: från och med nu gäller propsen igen. Låg det kvar
          // vann det över allt som kom utifrån efteråt — Återställ och −/+
          // gjorde ingenting så fort man dragit eller nypt en gång. Anroparen
          // sätter sitt värde i samma omgång, så bilden hoppar inte.
          setDragVal(null);
        },
        onPanResponderTerminate: () => setDragVal(null),
      }),
    [],
  );

  const mätRam = useCallback((e: { nativeEvent: { layout: { width: number; height: number } } }) => {
    const { width, height } = e.nativeEvent.layout;
    setRam(prev => (prev?.bredd === width && prev?.höjd === height ? prev : { bredd: width, höjd: height }));
  }, []);

  // Den uträknade rutan används bara när den behövs: när man drar i bilden,
  // eller när ett utsnitt faktiskt har valts. Annars vanlig cover, exakt som
  // före utsnitten — de flesta bilder har inget val, och cover kan inte lämna
  // tomma kanter.
  const användUtsnitt = !!utsnitt && (justerbar || dragVal !== null || ärJusterad(fokusX, fokusY, zoom));
  const bildstil = användUtsnitt && utsnitt
    ? { position: 'absolute' as const, left: utsnitt.x, top: utsnitt.y, width: utsnitt.bredd, height: utsnitt.höjd }
    : StyleSheet.absoluteFillObject;

  return (
    // overflow: hidden är INTE valfritt här. Bilden skalas medvetet större än
    // ramen — det är överskottet man drar i — så utan den spiller den ut över
    // sidan. Förut klippte resizeMode="cover" bilden åt oss.
    <View
      style={[style, styles.ram]}
      onLayout={mätRam}
      {...(justerbar ? panResponder.panHandlers : {})}
    >
      <Image
        source={{ uri }}
        style={bildstil}
        // Alltid cover, även i den uträknade rutan. Rutan har samma proportioner
        // som bilden enligt Image.getSize, och då är cover och stretch samma
        // sak. Men stämmer måtten inte med bilden som faktiskt visas ritades
        // den mindre än rutan, med tomma kanter på båda sidor (veckomenyn,
        // 2026-09-25). Rutan täcker alltid ramen, så med cover gör bilden det
        // också — i värsta fall beskuren en aning annorlunda än tänkt.
        resizeMode="cover"
        onError={onError}
        onLoadStart={onLoadStart}
        onLoadEnd={onLoadEnd}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  ram: { overflow: 'hidden' },
});
