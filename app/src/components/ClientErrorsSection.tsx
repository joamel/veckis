import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApiClient, type ClientErrorEntry } from '../api/client';
import { useToast } from '../context/ToastContext';
import { components as str, common } from '../lib/svenska';

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const sec = Math.floor((Date.now() - then) / 1000);
  if (sec < 60) return 'nyss';
  if (sec < 3600) return `${Math.floor(sec / 60)} min sedan`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} h sedan`;
  if (sec < 86400 * 2) return 'igår';
  return new Date(then).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function ErrorRow({ e, last }: { e: ClientErrorEntry; last: boolean }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Pressable onPress={() => setExpanded(v => !v)} style={[s.row, last && { borderBottomWidth: 0 }]}>
      <View style={s.rowTop}>
        <View style={{ flex: 1 }}>
          <Text style={s.errorName} numberOfLines={expanded ? undefined : 1}>{e.name}: {e.message}</Text>
          <Text style={s.meta}>{timeAgo(e.receivedAt)}{e.platform ? ` · ${e.platform}` : ''}{e.appVersion ? ` · v${e.appVersion}` : ''}</Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color="#d1d5db" />
      </View>
      {expanded && e.stack && (
        <ScrollView horizontal showsHorizontalScrollIndicator style={s.stackScroll}>
          <Text style={s.stack}>{e.stack}</Text>
        </ScrollView>
      )}
    </Pressable>
  );
}

export function ClientErrorsSection() {
  const client = useApiClient();
  const { showError } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [errors, setErrors] = useState<ClientErrorEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await client.getClientErrors();
      setErrors(data);
    } catch (e) {
      showError(e, common.errors.couldNotLoad('klientfel'));
    } finally {
      setLoading(false);
    }
  }, [client, showError]);

  useEffect(() => {
    if (expanded && errors === null) load();
  }, [expanded, errors, load]);

  return (
    <View style={s.box}>
      <Pressable
        style={s.header}
        onPress={() => setExpanded(v => !v)}
        accessibilityRole="button"
        accessibilityLabel={expanded ? str.clientErrorsSection.hideA11y : str.clientErrorsSection.showA11y}
      >
        <Ionicons name="bug-outline" size={16} color="#dc2626" />
        <Text style={s.title}>{str.clientErrorsSection.title}</Text>
        {errors && errors.length > 0 && (
          <View style={s.badge}><Text style={s.badgeText}>{errors.length}</Text></View>
        )}
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="#9ca3af" />
      </Pressable>

      {expanded && (
        <View style={s.body}>
          {loading && <ActivityIndicator size="small" color="#dc2626" style={{ marginVertical: 12 }} />}
          {!loading && errors && errors.length === 0 && (
            <Text style={s.empty}>{str.clientErrorsSection.noErrors}</Text>
          )}
          {!loading && errors && errors.map((e, idx) => (
            <ErrorRow key={e.id} e={e} last={idx === errors.length - 1} />
          ))}
          {!loading && errors && errors.length > 0 && (
            <Pressable style={s.refreshBtn} onPress={load} hitSlop={6}>
              <Ionicons name="refresh-outline" size={14} color="#6b7280" />
              <Text style={s.refreshText}>{str.clientErrorsSection.refresh}</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  box: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#fca5a5',
    marginTop: 12,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
    overflow: 'hidden',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
  title: { flex: 1, fontSize: 14, fontWeight: '600', color: '#111827' },
  badge: { backgroundColor: '#fee2e2', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#dc2626' },
  body: { paddingHorizontal: 14, paddingBottom: 10 },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  errorName: { fontSize: 13, color: '#374151', lineHeight: 18 },
  meta: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  stackScroll: { marginTop: 6, maxHeight: 120 },
  stack: { fontSize: 10, color: '#6b7280', fontFamily: 'monospace', lineHeight: 14 },
  empty: { fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingVertical: 16, fontStyle: 'italic' },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, marginTop: 4 },
  refreshText: { fontSize: 12, color: '#6b7280' },
});
