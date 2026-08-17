import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../lib/theme';
// Aktivitetslogg för admin — listar senaste audit-events för hushållet.
// Lazy-laddat: hämtar inte förrän användaren expanderar sektionen, så
// vi inte spammar audit-endpointen vid varje profil-besök.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { common, components as cmpStr } from '../lib/svenska';
import { useApiClient, type AuditLogEntry } from '../api/client';
import { useToast } from '../context/ToastContext';

interface Props {
  householdId: string;
}

/** Mänskligt-läsbar beskrivning av en audit-händelse. */
function describeEvent(e: AuditLogEntry): string {
  const actor = e.actorName ?? common.someone;
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
  if (sec < 60) return common.relTime.justNow;
  if (sec < 3600) return common.relTime.minAgo(Math.floor(sec / 60));
  if (sec < 86400) return common.relTime.hoursAgo(Math.floor(sec / 3600));
  if (sec < 86400 * 2) return common.relTime.yesterday;
  if (sec < 86400 * 7) return common.relTime.daysAgo(Math.floor(sec / 86400));
  const d = new Date(then);
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
}

export function AuditLogSection({ householdId }: Props) {
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
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
      showError(e, common.errors.couldNotLoad('aktivitetsloggen'));
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
        accessibilityLabel={expanded ? cmpStr.auditLog.hide : cmpStr.auditLog.show}
      >
        <Ionicons name="time-outline" size={16} color={c.primary} />
        <Text style={s.title}>Aktivitetslogg</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={c.textFaint} />
      </Pressable>

      {expanded && (
        <View style={s.body}>
          {loading && <ActivityIndicator size="small" color={c.primary} style={{ marginVertical: 12 }} />}
          {!loading && events && events.length === 0 && (
            <Text style={s.empty}>{cmpStr.auditLog.empty}</Text>
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
              <Ionicons name="refresh-outline" size={14} color={c.textMuted} />
              <Text style={s.refreshText}>Uppdatera</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  box: {
    backgroundColor: c.surface,
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: c.border,
    marginTop: 12,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
    overflow: 'hidden',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
  title: { flex: 1, fontSize: 14, fontWeight: '600', color: c.text },
  body: { paddingHorizontal: 14, paddingBottom: 10 },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.surfaceSubtle },
  eventText: { fontSize: 13, color: c.textSecondary, lineHeight: 18 },
  eventTime: { fontSize: 11, color: c.textFaint, marginTop: 2 },
  empty: { fontSize: 13, color: c.textFaint, textAlign: 'center', paddingVertical: 16, fontStyle: 'italic' },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, marginTop: 4 },
  refreshText: { fontSize: 12, color: c.textMuted },
});
