import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ÄR_WEBB = Platform.OS as any === 'web';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useDesign } from '../context/DesignContext';
import { ny, nyFont } from '../lib/nyDesign';
import { SheetHeader } from './SheetHeader';
import type { Palette } from '../lib/theme';

export type ConfirmButtonStyle = 'primary' | 'destructive' | 'cancel';
export interface ConfirmButton {
  label: string;
  onPress?: () => void;
  style?: ConfirmButtonStyle;
  icon?: string;
}
export interface ConfirmOptions {
  title?: string;
  message?: string;
  buttons: ConfirmButton[];
  /** 'menu' renders as a small popup at the top-right (for 3-dot action menus).
   *  'action' renders as a compact card centered at the bottom (for mid-screen buttons).
   *  Default 'sheet' is the standard bottom sheet. */
  variant?: 'sheet' | 'menu' | 'action';
  /** For variant 'menu': where the popup card anchors. Default 'top-right'
   *  (matches 3-dot menus). 'bottom-right' anchors above a FAB. */
  menuAnchor?: 'top-right' | 'bottom-right';
  /** For menuAnchor 'bottom-right': ref till knappen popupen hör till. Mäts vid
   *  öppning så kortet hamnar exakt MENU_ANCHOR_GAP px ovanför den. Krävs för
   *  att avståndet ska bli lika på skärmar MED och UTAN tab-bar — modalen
   *  täcker hela skärmen medan knappen sitter i en förminskad vy, så en fast
   *  offset ger olika resultat på de två. Utan ref används en rimlig gissning. */
  menuAnchorRef?: RefObject<{ measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void } | null>;
}

/** Luft mellan popup-kortets underkant och knappen den hör till. */
const MENU_ANCHOR_GAP = 8;

/** Tonad bakgrund bakom popup-menyer. Justera här om den känns för svag/stark. */
const MENU_SCRIM = 'rgba(0,0,0,0.2)';

export function ConfirmDialog({
  visible,
  options,
  onClose,
}: {
  visible: boolean;
  options: ConfirmOptions | null;
  onClose: () => void;
}) {
  const { colors: c } = useTheme();
  const { nyDesign } = useDesign();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const s = useMemo(() => makeStyles(c, nyDesign), [c, nyDesign]);

  // Menyn växer ur knappen den hör till i stället för att bara tonas in.
  // Skala + en liten förskjutning nedåt (menyn ligger OVANFÖR knappen) läser
  // som att pluset blir alternativen. Modal:ens egen fade sköter bakgrunden.
  const menuAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) { menuAnim.setValue(0); return; }
    Animated.timing(menuAnim, {
      toValue: 1,
      duration: 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, menuAnim]);

  // Mät ankarknappen när menyn öppnas. Nollställs vid stängning så nästa
  // öppning inte ritar kortet på förra knappens plats innan mätningen hunnit in.
  const anchorRef = options?.menuAnchorRef;
  const [anchorTop, setAnchorTop] = useState<number | null>(null);
  useEffect(() => {
    if (!visible || !anchorRef?.current) { setAnchorTop(null); return; }
    anchorRef.current.measureInWindow((_x, y) => setAnchorTop(y));
  }, [visible, anchorRef]);

  if (!options) return null;

  const dismiss = () => {
    options.buttons.find(b => b.style === 'cancel')?.onPress?.();
    onClose();
  };

  if (options.variant === 'menu' || options.variant === 'action') {
    const actionButtons = options.buttons.filter(b => b.style !== 'cancel');
    const firstDestructiveIdx = actionButtons.findIndex(b => b.style === 'destructive');
    const rows = actionButtons.map((b, i) => {
      const isDestructive = b.style === 'destructive';
      const color = nyDesign
        ? (isDestructive ? ny.fara : ny.skog)
        : (isDestructive ? c.danger : c.primary);
      const showDivider = i === firstDestructiveIdx && firstDestructiveIdx > 0;
      return (
        <View key={i}>
          {showDivider && <View style={s.menuDivider} />}
          <Pressable
            style={s.menuBtn}
            onPress={() => { onClose(); b.onPress?.(); }}
            accessibilityRole="button"
            accessibilityLabel={b.label}
          >
            {b.icon ? <Ionicons name={b.icon as never} size={20} color={color} /> : null}
            <Text style={[s.menuBtnText, { color }]}>{b.label}</Text>
          </Pressable>
        </View>
      );
    });

    if (options.variant === 'menu') {
      // Top-right-menyn förankras i övre högra hörnet men skjuts ned under
      // status bar-insetet så kortet inte lägger sig över klocka/batteri.
      // windowHeight är hela skärmen, men measureInWindow mäter på Android från
      // appfönstret — som börjar UNDER statusbaren. Utan korrigeringen blir
      // kortet exakt en statusbarhöjd för högt (uppmätt till ~36 dp för mycket
      // 2026-09-08). iOS mäter mot hela fönstret och behöver ingen korrigering.
      // OBS: verifiera på riktig iOS-enhet vid första TestFlight-bygget.
      const anchorOffset = Platform.OS === 'android' ? insets.top : 0;
      // Mätt ankare vinner; annars faller vi tillbaka på FAB:ens nominella läge
      // (bottom 20 + 56 hög) plus säkerhetszonen.
      const anchorStyle = options.menuAnchor === 'bottom-right'
        ? [s.menuCardBottomRight, {
            bottom: anchorTop !== null
              ? windowHeight - anchorTop - anchorOffset + MENU_ANCHOR_GAP
              : insets.bottom + 76 + MENU_ANCHOR_GAP,
          }]
        : [s.menuCardTopRight, { top: insets.top + 8 }];
      return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
          {/* Lätt tonad bakgrund: kortet är #ffffff mot en #faf8f3 sidbakgrund,
              så utan den syns bara skuggan. Svagare än sheet-/action-varianternas
              0.4 — en liten meny ska inte släcka ner halva appen — och visar
              samtidigt att man kan trycka utanför för att stänga. */}
          <View pointerEvents="none" style={{ ...StyleSheet.absoluteFillObject, backgroundColor: MENU_SCRIM }} />
          <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={dismiss} />
          <Animated.View
            style={[
              s.menuCardBase,
              anchorStyle,
              {
                opacity: menuAnim,
                transform: [
                  { scale: menuAnim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) },
                  { translateY: menuAnim.interpolate({ inputRange: [0, 1], outputRange: [options.menuAnchor === 'bottom-right' ? 12 : -12, 0] }) },
                ],
              },
            ]}
          >
            {rows}
          </Animated.View>
        </Modal>
      );
    }

    return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
        <View pointerEvents="none" style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' }} />
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={dismiss} />
        <View style={{ flex: 1, justifyContent: 'flex-end', paddingHorizontal: 16, paddingBottom: 40, pointerEvents: 'box-none' }}>
          <View style={[s.menuCardBase, { width: '100%' }]}>{rows}</View>
        </View>
      </Modal>
    );
  }

  // Samma anatomi som alla andra ark: rubrik och text i det mörkgröna huvudet,
  // knapparna i den ljusa kroppen. BARA den första primära knappen är fylld
  // mörkgrön — två fyllda staplade tävlar om uppmärksamheten.
  const forstaPrimar = options.buttons.findIndex(b => (b.style ?? 'primary') === 'primary');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
      {/* height 100dvh på web: Modal blir annars 100% hög, och Chrome på
          Android räknar in ytan BAKOM adressfältet. Arket hamnade då delvis
          utanför synfältet — underkanten kapad och bara ena hörnet rundat i
          bild. dvh följer den synliga viewporten och krymper när fältet visas.
          Ignoreras av native. */}
      <View style={[s.overlay, ÄR_WEBB && ({ height: '100dvh' } as object)]}>
        <Pressable style={{ flex: 1 }} onPress={dismiss} />
        <View style={s.sheet}>
          <SheetHeader title={options.title} subtitle={options.message} />
          {/* Safe area i botten så gestindikatorn inte ligger över knappen.
              Knapparna staplas i stället för att ligga sida vid sida: svenska
              etiketter som "Lägg till i veckan" ryms inte på en halv bredd. */}
          <View style={[s.body, { paddingBottom: 24 + insets.bottom }]}>
            {options.buttons.map((b, i) => {
              const style = b.style ?? 'primary';
              return (
                <Pressable
                  key={i}
                  style={[
                    s.btn,
                    style === 'cancel' ? s.btnAvbryt : i === forstaPrimar ? s.btnPrimar : s.btnSekundar,
                  ]}
                  onPress={() => { onClose(); b.onPress?.(); }}
                  accessibilityRole="button"
                  accessibilityLabel={b.label}
                >
                  <Text
                    style={[
                      s.btnText,
                      style === 'destructive' && s.btnTextDestructive,
                      style === 'cancel' && s.btnTextCancel,
                      i === forstaPrimar && s.btnTextPrimar,
                    ]}
                  >
                    {b.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// nyD: den nya designen skriver over de stilar som skiljer (menyvarianterna).
const makeStyles = (c: Palette, nyD = false) => StyleSheet.create({
  // Sheet variant (default)
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: ny.kort, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  body: { paddingHorizontal: 24, paddingTop: 20, gap: 10 },
  btn: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  btnPrimar: { backgroundColor: ny.skog },
  btnSekundar: { backgroundColor: ny.ljus },
  btnAvbryt: { backgroundColor: 'transparent' },
  // Outfit bär vikten i typsnittet — en fontWeight till ger reservtypsnitt.
  btnText: { fontFamily: nyFont.halvfet, fontWeight: 'normal', fontSize: 16, color: ny.skog },
  btnTextPrimar: { color: ny.rubrikLjus },
  btnTextDestructive: { color: ny.fara },
  btnTextCancel: { color: ny.textDampad },

  // Menu/action variants
  menuCardBase: {
    backgroundColor: nyD ? ny.ljus : c.surface,
    borderRadius: nyD ? 16 : 12,
    paddingVertical: 6,
    minWidth: 220,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
    overflow: 'hidden',
  },
  menuCardTopRight: { position: 'absolute', right: 8, top: 0 },
  // Ovanför FAB:en i nedre högra hörnet. Botten sätts i komponenten utifrån en
  // mätning av knappen (se menuAnchorRef) — en fast offset går inte, eftersom
  // modalen täcker hela skärmen medan FAB:en sitter i en förminskad vy vars
  // höjd varierar med tab-bar och säkerhetszon.
  menuCardBottomRight: { position: 'absolute', right: 8 },
  menuBtn: { paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuBtnText: { fontSize: 15, fontWeight: '500', color: nyD ? ny.skog : c.primary },
  menuDivider: { height: 1, backgroundColor: nyD ? ny.kontur : c.surfaceSubtle, marginVertical: 4 },
});
