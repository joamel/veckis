import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHousehold } from '../context/HouseholdContext';
import { useTablet } from '../hooks/useTablet';

interface ScreenHeaderProps {
  title: string;
  actionIcon?: string;
  actionLabel?: string;
  onActionPress?: () => void;
  actionNode?: ReactNode;
}

export function ScreenHeader({ title, actionIcon, actionLabel, onActionPress, actionNode }: ScreenHeaderProps) {
  const { householdName } = useHousehold();
  const { fs, sp } = useTablet();

  return (
    <View style={s.header}>
      <View style={[s.headerTop, { paddingHorizontal: sp(20), paddingTop: sp(20), paddingBottom: sp(10) }]}>
        <View style={s.headerTitleSection}>
          <Text style={[s.title, { fontSize: fs(28) }]}>{title}</Text>
          {householdName && (
            <View style={s.subtitleRow}>
              <Ionicons name="home-outline" size={fs(13)} color="#78716c" />
              <Text style={[s.subtitle, { fontSize: fs(13), marginTop: 0 }]}>{householdName}</Text>
            </View>
          )}
        </View>
        {actionNode ? actionNode : (actionIcon && actionLabel && onActionPress && (
          <Pressable
            style={[s.actionBtn, { paddingHorizontal: sp(12), paddingVertical: sp(7) }]}
            onPress={onActionPress}
          >
            <Ionicons name={actionIcon as any} size={fs(16)} color="#4e7a5e" />
            <Text style={[s.actionBtnText, { fontSize: fs(13) }]}>{actionLabel}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  header: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1efec', paddingBottom: 10 },
  headerTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
  },
  headerTitleSection: { flex: 1 },
  title: { fontWeight: '700', color: '#292524' },
  subtitle: { color: '#78716c', marginTop: 2 },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ecf3ec', borderRadius: 20 },
  actionBtnText: { fontWeight: '600', color: '#4e7a5e' },
});
