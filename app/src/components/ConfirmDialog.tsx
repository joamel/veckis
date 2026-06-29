import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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
      const color = isDestructive ? '#ef4444' : '#4f46e5';
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
      return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
          <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={dismiss} />
          <View style={[s.menuCardBase, s.menuCardTopRight]}>{rows}</View>
        </Modal>
      );
    }

    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={dismiss} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
          <View style={[s.menuCardBase, { width: '100%', maxWidth: 360 }]}>{rows}</View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
      <View style={s.overlay}>
        <Pressable style={{ flex: 1 }} onPress={dismiss} />
        <View style={s.sheet}>
          <View style={s.handle} />
          {options.title ? <Text style={s.title}>{options.title}</Text> : null}
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

  // Menu/action variants
  menuCardBase: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 6,
    minWidth: 220,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
    overflow: 'hidden',
  },
  menuCardTopRight: { position: 'absolute', right: 0, top: 0 },
  menuBtn: { paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuBtnText: { fontSize: 15, fontWeight: '500', color: '#4f46e5' },
  menuDivider: { height: 1, backgroundColor: '#f3f4f6', marginVertical: 4 },
});
