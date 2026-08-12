import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../lib/theme';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { components as str, common } from '../lib/svenska';

export interface MultiMemberPickerProps {
  members: { id: string; displayName: string }[];
  selected: string[];
  rotation: boolean;
  onChange: (ids: string[]) => void;
  onRotationChange: (v: boolean) => void;
  /** När false (t.ex. engångssyssla utan upprepning) visas rotation-raden
   *  utgråad med en förklaring i stället för att vara valbar. Default true. */
  rotationAllowed?: boolean;
  /** Dölj turordnings-editorn (override). Default: visas när rotation=true och 3+ är valda. */
  showOrderSection?: boolean;
  /** Dölj rotation-raden helt. Default: visas när 2+ valda och rotationAllowed. */
  showRotation?: boolean;
  /** Kallas när rotation slås på ELLER när "Redigera ordning" trycks. Utelämnas = ingen ordningsmodal. */
  onOpenOrderModal?: () => void;
}

export function MultiMemberPicker({ members, selected, rotation, onChange, onRotationChange, rotationAllowed = true, showOrderSection, showRotation, onOpenOrderModal }: MultiMemberPickerProps) {
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  if (members.length === 0) return null;
  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter(x => x !== id));
    else onChange([...selected, id]);
  };
  const handleRotationPress = () => {
    const next = !rotation;
    onRotationChange(next);
    if (next) onOpenOrderModal?.();
  };
  return (
    <>
      <Text style={s.label}>{str.multiMemberPicker.label(selected.length)}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.memberChipRow}>
        <Pressable
          style={[s.memberChip, selected.length === 0 && s.memberChipActive]}
          onPress={() => onChange([])}
        >
          <Text style={[s.memberChipText, selected.length === 0 && s.memberChipTextActive]}>{str.multiMemberPicker.none}</Text>
        </Pressable>
        {members.map(m => {
          const isActive = selected.includes(m.id);
          return (
            <Pressable
              key={m.id}
              style={[s.memberChip, isActive && s.memberChipActive]}
              onPress={() => toggle(m.id)}
            >
              <Text style={[s.memberChipText, isActive && s.memberChipTextActive]}>{m.displayName}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {selected.length >= 2 && showRotation !== false ? (
        <>
          <Pressable
            style={[s.rotationRow, !rotationAllowed && s.rotationRowDisabled]}
            onPress={rotationAllowed
              ? (onOpenOrderModal ? handleRotationPress : () => onRotationChange(!rotation))
              : undefined}
            accessibilityRole="switch"
            accessibilityState={{ checked: rotation, disabled: !rotationAllowed }}
          >
            <View style={[s.rotationBox, rotation && rotationAllowed && s.rotationBoxActive]}>
              {rotation && rotationAllowed ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.rotationLabel, !rotationAllowed && s.rotationLabelDisabled]}>{str.multiMemberPicker.rotation.label}</Text>
              <Text style={s.rotationSub}>
                {!rotationAllowed
                  ? str.multiMemberPicker.rotation.disabledSub
                  : rotation
                    ? str.multiMemberPicker.rotation.onSub
                    : str.multiMemberPicker.rotation.offSub}
              </Text>
            </View>
            {rotation && rotationAllowed && onOpenOrderModal && (
              <Pressable onPress={onOpenOrderModal} hitSlop={8} style={s.editOrderBtn}>
                <Text style={s.editOrderBtnText}>{common.actions.edit}</Text>
                <Ionicons name="chevron-forward" size={13} color={c.accent} />
              </Pressable>
            )}
          </Pressable>
          {rotation && selected.length >= 3 && showOrderSection !== false && !onOpenOrderModal && (
            <View style={s.orderSection}>
              <Text style={s.orderLabel}>{str.multiMemberPicker.order.label}</Text>
              {selected.map((id, i) => {
                const m = members.find(x => x.id === id);
                if (!m) return null;
                const moveUp = () => {
                  const a = [...selected];
                  [a[i - 1], a[i]] = [a[i], a[i - 1]];
                  onChange(a);
                };
                const moveDown = () => {
                  const a = [...selected];
                  [a[i], a[i + 1]] = [a[i + 1], a[i]];
                  onChange(a);
                };
                return (
                  <View key={id} style={s.orderRow}>
                    <Text style={s.orderNum}>{i + 1}</Text>
                    <Text style={s.orderName}>{m.displayName}</Text>
                    <View style={s.orderBtns}>
                      <Pressable
                        onPress={moveUp}
                        disabled={i === 0}
                        style={s.orderBtn}
                        accessibilityLabel={str.multiMemberPicker.order.moveUp}
                      >
                        <Ionicons name="chevron-up" size={18} color={i === 0 ? c.border : c.textMuted} />
                      </Pressable>
                      <Pressable
                        onPress={moveDown}
                        disabled={i === selected.length - 1}
                        style={s.orderBtn}
                        accessibilityLabel={str.multiMemberPicker.order.moveDown}
                      >
                        <Ionicons name="chevron-down" size={18} color={i === selected.length - 1 ? c.border : c.textMuted} />
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </>
      ) : null}
    </>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600', color: c.textSecondary },
  memberChipRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  memberChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: c.borderLight, backgroundColor: c.background, flexShrink: 0 },
  memberChipActive: { borderColor: c.accent, backgroundColor: c.accentTint },
  memberChipText: { fontSize: 14, color: c.textSecondary, fontWeight: '500' },
  memberChipTextActive: { color: c.accent, fontWeight: '600' },
  rotationRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6, paddingHorizontal: 4, marginTop: 4 },
  rotationRowDisabled: { opacity: 0.45 },
  rotationBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: c.border, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface },
  rotationBoxActive: { borderColor: c.accent, backgroundColor: c.accent },
  rotationLabel: { fontSize: 15, fontWeight: '600', color: c.text },
  rotationLabelDisabled: { color: c.textMuted },
  rotationSub: { fontSize: 12, color: c.textMuted, marginTop: 2, lineHeight: 17 },
  editOrderBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  editOrderBtnText: { fontSize: 13, color: c.accent, fontWeight: '600' },
  orderSection: { marginTop: 10, gap: 4 },
  orderLabel: { fontSize: 12, fontWeight: '600', color: c.textFaint, letterSpacing: 0.5, marginBottom: 4 },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: c.accentTint, borderRadius: 10, borderWidth: 1, borderColor: c.accent100 },
  orderNum: { fontSize: 13, fontWeight: '700', color: c.accent, width: 18, textAlign: 'center' },
  orderName: { flex: 1, fontSize: 14, fontWeight: '500', color: c.text },
  orderBtns: { flexDirection: 'row', gap: 2 },
  orderBtn: { padding: 4 },
});
