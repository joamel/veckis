import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { formateraTidsetikett } from '../lib/cookTimer';

const STEG = 5;
const MAX = 480;
const RAD = 36;
const SYNLIGA = 5;
const HOJD = RAD * SYNLIGA;

/** Knappens position i fönstret, från measureInWindow. */
export type Ankare = { x: number; y: number; w: number; h: number };

/**
 * Liten vertikal hjulväljare som öppnas ovanpå tidsknappen: den valda raden
 * ligger i höjd med knappen, två rader syns ovanför och under. 5 min per
 * steg; översta läget är "okänd" (null). Tryck utanför stänger.
 *
 * Renderas som ett överlägg över hela skärmen och mäter SIN EGEN position i
 * fönstret, så ankaret kan räknas om till lokala koordinater — samma sätt
 * som SpotlightTip, eftersom fönstrets origo inte är skärmens på Android med
 * edge-to-edge.
 */
export function TidsSnurra({ ankare, value, onChange, onClose, placeholder, farger }: {
  ankare: Ankare;
  value: number | null;
  onChange: (minuter: number | null) => void;
  onClose: () => void;
  placeholder: string;
  farger: { yta: string; text: string; dampad: string; band: string };
}) {
  const varden = useMemo(() => Array.from({ length: MAX / STEG + 1 }, (_, i) => i * STEG), []);
  const rotRef = useRef<View>(null);
  const [origo, setOrigo] = useState<{ x: number; y: number } | null>(null);
  const [vald, setVald] = useState(value ?? 0);
  const startIndex = useRef(Math.round((value ?? 0) / STEG)).current;
  const scrollRef = useRef<ScrollView>(null);

  const läs = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.max(0, Math.min(varden.length - 1, Math.round(e.nativeEvent.contentOffset.y / RAD)));
    const m = varden[i];
    if (m === vald) return;
    setVald(m);
    onChange(m === 0 ? null : m);
  };

  const bredd = Math.max(ankare.w, 128);
  const pos = origo && {
    left: Math.max(8, ankare.x - origo.x + (ankare.w - bredd) / 2),
    top: Math.max(8, ankare.y - origo.y + ankare.h / 2 - HOJD / 2),
  };

  return (
    <View
      ref={rotRef}
      style={StyleSheet.absoluteFill}
      onLayout={() => rotRef.current?.measureInWindow((x, y) => setOrigo({ x, y }))}
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" />
      {pos && (
        <View style={[st.hjul, { width: bredd, backgroundColor: farger.yta }, pos]}>
          {/* Bandet bakom den valda raden. */}
          <View pointerEvents="none" style={[st.band, { backgroundColor: farger.band }]} />
          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            snapToInterval={RAD}
            decelerationRate="fast"
            contentContainerStyle={{ paddingVertical: RAD * Math.floor(SYNLIGA / 2) }}
            contentOffset={{ x: 0, y: startIndex * RAD }}
            onLayout={() => scrollRef.current?.scrollTo({ y: startIndex * RAD, animated: false })}
            onScroll={läs}
            onMomentumScrollEnd={läs}
            scrollEventThrottle={16}
          >
            {varden.map(m => {
              const text = m === 0 ? placeholder : formateraTidsetikett(m);
              const ärVald = m === vald;
              return (
                <Pressable
                  key={m}
                  style={st.rad}
                  // Tryck på en rad hoppar dit — snabbare än att snurra en bit.
                  onPress={() => scrollRef.current?.scrollTo({ y: (m / STEG) * RAD, animated: true })}
                >
                  {/* Explicit bredd — Android klipper annars efter mellanslag. */}
                  <Text
                    style={[st.text, { width: bredd, color: ärVald ? farger.text : farger.dampad }, ärVald && st.textVald]}
                    numberOfLines={1}
                  >
                    {text}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  hjul: {
    position: 'absolute', height: HOJD, borderRadius: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  band: { position: 'absolute', left: 6, right: 6, top: RAD * Math.floor(SYNLIGA / 2), height: RAD, borderRadius: 10 },
  rad: { height: RAD, justifyContent: 'center' },
  text: { fontSize: 15, textAlign: 'center' },
  textVald: { fontWeight: '700' },
});
