import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

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
}

/**
 * App-styled replacement for the native Alert.alert — bottom sheet with rounded
 * top corners, matches the rest of the app's modals. Buttons stack vertically
 * with thin separators; styles convey intent (primary/destructive/cancel).
 */
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
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose} />
      <View style={s.sheetWrap} pointerEvents="box-none">
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
                onPress={() => { b.onPress?.(); onClose(); }}
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
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
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
});
