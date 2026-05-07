import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHousehold } from '../context/HouseholdContext';

interface ScreenHeaderProps {
  title: string;
  actionIcon?: string;
  actionLabel?: string;
  onActionPress?: () => void;
  actionNode?: ReactNode;
}

export function ScreenHeader({ title, actionIcon, actionLabel, onActionPress, actionNode }: ScreenHeaderProps) {
  const { householdName, householdEmoji } = useHousehold();

  return (
    <View style={s.header}>
      <View style={s.headerTop}>
        <View style={s.headerTitleSection}>
          <Text style={s.title}>{title}</Text>
          {householdName && <Text style={s.subtitle}>{householdEmoji || '🏠'} {householdName}</Text>}
        </View>
        {actionNode ? actionNode : (actionIcon && actionLabel && onActionPress && (
          <Pressable style={s.actionBtn} onPress={onActionPress}>
            <Ionicons name={actionIcon as any} size={16} color="#4f46e5" />
            <Text style={s.actionBtnText}>{actionLabel}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  header: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', paddingBottom: 10 },
  headerTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10,
  },
  headerTitleSection: { flex: 1 },
  title: { fontSize: 28, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#eef2ff', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  actionBtnText: { fontSize: 13, fontWeight: '600', color: '#4f46e5' },
});
