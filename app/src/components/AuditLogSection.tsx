// Aktivitetslogg för admin — listar senaste audit-events för hushållet.
// Lazy-laddat: hämtar inte förrän användaren expanderar sektionen, så
// vi inte spammar audit-endpointen vid varje profil-besök.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApiClient, type AuditLogEntry } from '../api/client';
import { useToast } from '../context/ToastContext';

interface Props {
  householdId: string;
}

/** Mänskligt-läsbar beskrivning av en audit-händelse. */
function describeEvent(e: AuditLogEntry): string {
  const actor = e.actorName ?? 'Någon';
  const target = e.targetName ?? '(borttagen)';
  switch (e.action) {
    case 'household.update': {
      const oldName = (e.metadata?.oldName as string | undefined) ?? null;
      const newName = (e.metadata?.newName as string | undefined) ?? target;
      return oldName && oldName !== newName
        ? `${actor} bytte hushållets namn från "${oldName}" till "${newName}"`
        : `${actor} uppdaterade hushållet`;
    }
    case 'household.delete':
      return `${actor} tog bort hushållet "${target}"`;
    case 'member.role_change': {
      const newRole = (e.metadata?.newRole as string | undefined) ?? '';
      return newRole === 'admin'
        ? `${actor} gjorde ${target} till admin`
        : `${actor} tog bort admin från ${target}`;
    }
    case 'member.remove':
      return `${actor} tog bort medlemmen ${target}`;
    default:
      return `${actor}: ${e.action}`;
  }
}

/** "5 min sedan" / "2 timmar sedan" / "igår" / "12 mars" — kort relativ tid. */
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const sec = Math.floor((Date.now() - then) / 1000);
  if (sec < 60) return 'nyss';
  if (sec < 3600) return `${Math.floor(sec / 60)} min sedan`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} h sedan`;
  if (sec < 86400 * 2) return 'igår';
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)} dagar sedan`;
  const d = new Date(then);
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
}

export function AuditLogSection({ householdId }: Props) {
  const client = useApiClient();
  const { showError } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [events, setEvents] = useState<AuditLogEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await client.getAuditLog(householdId, { limit: 50 });
      setEvents(data);
    } catch (e) {
      showError(e, 'Kunde inte ladda aktivitetslogg');
    } finally {
      setLoading(false);
    }
  }, [client, householdId, showError]);

  useEffect(() => {
    if (expanded && events === null) load();
  }, [expanded, events, load]);

  return (
    <View style={s.box}>
      <Pressable
        style={s.header}
        onPress={() => setExpanded(v => !v)}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Dölj aktivitetslogg' : 'Visa aktivitetslogg'}
      >
        <Ionicons name="time-outline" size={16} color="#4e7a5e" />
        <Text style={s.title}>Aktivitetslogg</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="#a8a29e" />
      </Pressable>

      {expanded && (
        <View style={s.body}>
          {loading && <ActivityIndicator size="small" color="#4e7a5e" style={{ marginVertical: 12 }} />}
          {!loading && events && events.length === 0 && (
            <Text style={s.empty}>Inga händelser ännu.</Text>
          )}
          {!loading && events && events.map((e, idx) => (
            <View
              key={e.id}
              style={[s.row, idx === events.length - 1 && { borderBottomWidth: 0 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.eventText}>{describeEvent(e)}</Text>
                <Text style={s.eventTime}>{timeAgo(e.createdAt)}</Text>
              </View>
            </View>
          ))}
          {!loading && events && events.length > 0 && (
            <Pressable style={s.refreshBtn} onPress={load} hitSlop={6}>
              <Ionicons name="refresh-outline" size={14} color="#78716c" />
              <Text style={s.refreshText}>Uppdatera</Text>
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
    borderLeftColor: '#d6d3d1',
    marginTop: 12,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
    overflow: 'hidden',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
  title: { flex: 1, fontSize: 14, fontWeight: '600', color: '#292524' },
  body: { paddingHorizontal: 14, paddingBottom: 10 },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1efec' },
  eventText: { fontSize: 13, color: '#44403c', lineHeight: 18 },
  eventTime: { fontSize: 11, color: '#a8a29e', marginTop: 2 },
  empty: { fontSize: 13, color: '#a8a29e', textAlign: 'center', paddingVertical: 16, fontStyle: 'italic' },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, marginTop: 4 },
  refreshText: { fontSize: 12, color: '#78716c' },
});
