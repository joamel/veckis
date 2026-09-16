import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ny, nyFont } from '../lib/nyDesign';

/** Arkens gemensamma huvud: mörkgrönt, med handtag, rubrik och ev. knappar
 *  på sidorna. Delas av DraggableBottomSheet och ConfirmDialog.
 *  `handle` ersätter det vanliga handtaget, t.ex. med ett som har en draggest. */
export function SheetHeader({
  title,
  subtitle,
  left,
  right,
  handle,
}: {
  title?: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  handle?: ReactNode;
}) {
  const harRad = !!(title || left || right);
  return (
    <View style={[styles.header, !harRad && !subtitle && styles.headerTom]}>
      {handle ?? <SheetHandle />}
      {harRad ? (
        <View style={styles.titleRow}>
          {left}
          <Text style={styles.title}>{title}</Text>
          {right}
        </View>
      ) : null}
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

/** Ikonfärg för knappar i arkets mörka huvud. */
export const SHEET_HEADER_ICON = ny.rubrikLjus;

const styles = StyleSheet.create({
  header: { backgroundColor: ny.skog, paddingHorizontal: 24, paddingBottom: 20 },
  // Bara handtaget: en smal mörk list i stället för ett tomt huvud.
  headerTom: { paddingBottom: 2 },
  // Handtaget har en generös osynlig träffyta (inte bara den smala synliga
  // stapeln) så draget är lätt att träffa med tummen.
  handleHitArea: { alignItems: 'center', paddingTop: 12, paddingBottom: 14 },
  handle: { width: 48, height: 5, borderRadius: 3, backgroundColor: ny.handtagSkog },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32 },
  // Outfit bär vikten i typsnittet — en fontWeight till ger reservtypsnitt.
  title: { flex: 1, fontFamily: nyFont.fet, fontWeight: 'normal', fontSize: 22, letterSpacing: -0.4, color: ny.rubrikLjus },
  subtitle: { fontSize: 14, lineHeight: 20, color: ny.underrubrik, marginTop: 4 },
});

/** Draghandtaget, för ark som lägger en gest runt det. */
export function SheetHandle() {
  return (
    <View style={styles.handleHitArea}>
      <View style={styles.handle} />
    </View>
  );
}
