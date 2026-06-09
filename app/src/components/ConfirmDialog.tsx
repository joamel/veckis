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
  // Dismiss via overlay/back acts like the cancel button so promise-based
  // consumers don't hang waiting for a resolve from an explicit tap.
  const dismiss = () => {
    options.buttons.find(b => b.style === 'cancel')?.onPress?.();
    onClose();
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
      {/* flex-column: the dim lives on the outer container (so it also shows
          BEHIND the sheet's rounded top corners), and a transparent Pressable
          fills the space above the sheet for tap-to-dismiss — no overlapping
          siblings that could absorb taps on iOS Safari web (absoluteFillObject
          + sibling sheet is unreliable there). */}
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
                // onClose BEFORE b.onPress: React batches state updates, so if
                // b.onPress calls confirm() (another setOpts) it must come last
                // to avoid setOpts(null) overwriting the new opts.
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
});
