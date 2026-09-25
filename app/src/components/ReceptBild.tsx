import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Image, PanResponder, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  fokusEfterDrag,
  räknaUtsnitt,
  ärJusterad,
  MITTEN,
  type Bildmått,
  type Ram,
  type Utsnitt,
} from '../lib/bildutsnitt';

export type Fokus = { x: number | null; y: number | null };

/**
 * Receptbilden i sin 16:9-ram, med valbart utsnitt.
 *
 * Bilden beskärs aldrig som fil — hela originalet ligger kvar och det som
 * sparas är en fokuspunkt. Är `justerbar` satt kan man dra i bilden för att
 * välja vilken del som ska synas; `onJusterad` anropas när man släpper, så
 * anroparen kan spara. Under tiden måtten är okända visas bilden som vanlig
 * cover, vilket är exakt det utsnitt den hade innan den här komponenten fanns.
 */
export function ReceptBild({
  uri,
  fokusX,
  fokusY,
  justerbar = false,
  onJusterad,
  style,
  children,
  onError,
  onLoadStart,
  onLoadEnd,
}: {
  uri: string;
  fokusX: number | null;
  fokusY: number | null;
  /** Låter användaren dra i bilden för att välja utsnitt. */
  justerbar?: boolean;
  /** Anropas när ett drag släpps, med den nya fokuspunkten. */
  onJusterad?: (fokus: Fokus) => void;
  style?: StyleProp<ViewStyle>;
  /** Läggs ovanpå bilden (spinner, felruta, dra-hjälptext …). */
  children?: ReactNode;
  onError?: () => void;
  onLoadStart?: () => void;
  onLoadEnd?: () => void;
}) {
  const [ram, setRam] = useState<Ram | null>(null);
  const [bild, setBild] = useState<Bildmått | null>(null);
  // Fokus under pågående drag. Utanför drag speglar den propsen.
  const [dragFokus, setDragFokus] = useState<Fokus | null>(null);

  // Ny bild → gamla måtten gäller inte, och ett pågående drag hör till den förra.
  useEffect(() => {
    setBild(null);
    setDragFokus(null);
    let avbruten = false;
    Image.getSize(
      uri,
      (bredd, höjd) => { if (!avbruten) setBild({ bredd, höjd }); },
      // Går måtten inte att läsa faller vi tillbaka på cover — bilden visas,
      // den går bara inte att justera.
      () => { if (!avbruten) setBild(null); },
    );
    return () => { avbruten = true; };
  }, [uri]);

  const fokus: Fokus = dragFokus ?? { x: fokusX, y: fokusY };
  const utsnitt: Utsnitt | null = useMemo(
    () => (ram && bild ? räknaUtsnitt(ram, bild, fokus.x, fokus.y) : null),
    [ram, bild, fokus.x, fokus.y],
  );

  // Refs så PanResponder (byggs en gång) alltid ser aktuella värden.
  const utsnittRef = useRef<Utsnitt | null>(null);
  utsnittRef.current = utsnitt;
  const fokusRef = useRef<Fokus>(fokus);
  fokusRef.current = fokus;
  const startRef = useRef<Fokus>({ x: null, y: null });
  const onJusteradRef = useRef(onJusterad);
  onJusteradRef.current = onJusterad;
  const justerbarRef = useRef(justerbar);
  justerbarRef.current = justerbar;

  const kanDras = !!utsnitt && (utsnitt.överskottX > 1 || utsnitt.överskottY > 1);
  const kanDrasRef = useRef(kanDras);
  kanDrasRef.current = kanDras;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Bara när det både är tillåtet och finns något utanför ramen att dra
        // fram — annars skulle ett tryck på bilden fånga gesten i onödan.
        onStartShouldSetPanResponder: () => justerbarRef.current && kanDrasRef.current,
        onMoveShouldSetPanResponder: () => justerbarRef.current && kanDrasRef.current,
        onPanResponderGrant: () => {
          startRef.current = { x: fokusRef.current.x, y: fokusRef.current.y };
        },
        onPanResponderMove: (_e, gest) => {
          const u = utsnittRef.current;
          if (!u) return;
          setDragFokus({
            x: fokusEfterDrag(startRef.current.x, gest.dx, u.överskottX),
            y: fokusEfterDrag(startRef.current.y, gest.dy, u.överskottY),
          });
        },
        onPanResponderRelease: () => {
          const f = fokusRef.current;
          onJusteradRef.current?.({ x: f.x ?? MITTEN, y: f.y ?? MITTEN });
        },
        onPanResponderTerminate: () => setDragFokus(null),
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
  const användUtsnitt = !!utsnitt && (justerbar || dragFokus !== null || ärJusterad(fokusX, fokusY));
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
