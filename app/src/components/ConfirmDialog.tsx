import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type ConfirmButtonStyle = 'primary' | 'destructive' | 'cancel';
export interface ConfirmButton {
  label: string;
  onPress?: () => void;
  style?: ConfirmButtonStyle;
}
export interface ConfirmOptions {
  title: string;
  message?: string;
  buttons: ConfirmButton[];
  /** 'menu' renders as a small popup at the top-right (for 3-dot action menus).
   *  Default 'sheet' is the standard bottom sheet. */
  variant?: 'sheet' | 'menu';
}

export function ConfirmDialog({
  visible,
  options,
  onClose,
}: {
  visible: boolean;
  options: ConfirmOptions | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!options) return null;

  const dismiss = () => {
    options.buttons.find(b => b.style === 'cancel')?.onPress?.();
    onClose();
  };

  if (options.variant === 'menu') {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
        <Pressable style={s.menuOverlay} onPress={dismiss}>
          <Pressable
            style={[s.menuCard, { top: insets.top }]}
            onPress={e => e.stopPropagation?.()}
          >
            {options.title ? (
              <Text style={s.menuTitle}>{options.title}</Text>
            ) : null}
            {options.buttons.filter(b => b.style !== 'cancel').map((b, i) => {
              const bStyle = b.style ?? 'primary';
              const isFirst = i === 0;
              return (
                <Pressable
                  key={i}
                  style={[s.menuBtn, !isFirst && s.menuBtnBorder]}
                  onPress={() => { onClose(); b.onPress?.(); }}
                  accessibilityRole="button"
                  accessibilityLabel={b.label}
                >
                  <Text style={[s.menuBtnText, bStyle === 'destructive' && s.menuBtnDestructive]}>
                    {b.label}
                  </Text>
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
      <View style={s.overlay}>
        <Pressable style={{ flex: 1 }} onPress={dismiss} />
        <View style={s.sheet}>
          <View style={s.handle} />
          <Text style={s.title}>{options.title}</Text>
          {options.message ? <Text style={s.message}>{options.message}</Text> : null}
          {options.buttons.map((b, i) => {
            const style = b.style ?? 'primary';
            return (
              <Pressable
                key={i}
                style={[s.btn, i > 0 && s.btnTopBorder]}
                onPress={() => { onClose(); b.onPress?.(); }}
                accessibilityRole="button"
                accessibilityLabel={b.label}
              >
                <Text
                  style={[
                    s.btnText,
                    style === 'primary' && s.btnTextPrimary,
                    style === 'destructive' && s.btnTextDestructive,
                    style === 'cancel' && s.btnTextCancel,
                  ]}
                >
                  {b.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  // Sheet variant (default)
  overlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.55)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingBottom: 36,
    paddingHorizontal: 24,
  },
  handle: { alignSelf: 'center', width: 36, height: 4, backgroundColor: '#e5e7eb', borderRadius: 2, marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '700', color: '#111827', textAlign: 'center', marginBottom: 4 },
  message: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 12 },
  btn: { paddingVertical: 14, alignItems: 'center' },
  btnTopBorder: { borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  btnText: { fontSize: 16, fontWeight: '600' },
  btnTextPrimary: { color: '#4f46e5' },
  btnTextDestructive: { color: '#ef4444' },
  btnTextCancel: { color: '#6b7280', fontWeight: '500' },

  // Menu variant
  menuOverlay: { flex: 1 },
  menuCard: {
    position: 'absolute',
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 12,
    minWidth: 180,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
    overflow: 'hidden',
  },
  menuTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9ca3af',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  menuBtn: { paddingVertical: 13, paddingHorizontal: 16 },
  menuBtnBorder: { borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  menuBtnText: { fontSize: 15, fontWeight: '500', color: '#111827' },
  menuBtnDestructive: { color: '#ef4444' },
});
