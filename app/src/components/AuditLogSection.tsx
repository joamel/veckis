import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useDesign } from '../context/DesignContext';
import { ny, nyFont } from '../lib/nyDesign';
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
  const { nyDesign } = useDesign();
  const s = useMemo(() => makeStyles(c, nyDesign), [c, nyDesign]);
  const client = useApiClient();
  const { showError } = useToast();
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

  // Renderas i en dedikerad "Aktivitetslogg"-modal → ladda direkt vid mount
  // (öppnas bara på admin-begäran, så ingen onödig endpoint-spam).
  useEffect(() => {
    if (events === null) load();
  }, [events, load]);

  return (
    <View style={s.box}>
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
            <Ionicons name="refresh-outline" size={14} color={nyDesign ? ny.skog : c.textMuted} />
            <Text style={s.refreshText}>Uppdatera</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// nyD: den nya designen skriver over de stilar som skiljer.
const makeStyles = (c: Palette, nyD = false) => StyleSheet.create({
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
    // Ljus yta i det kort-fargade arket, samma skiktning som ovriga listor.
    ...(nyD ? { backgroundColor: ny.ljus, borderRadius: 18, borderLeftWidth: 0, shadowOpacity: 0, elevation: 0 } : {}),
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
  // Outfit bar vikten i typsnittet — fontWeight till ger reservtypsnitt.
  title: nyD
    ? { flex: 1, fontFamily: nyFont.halvfet, fontWeight: 'normal', fontSize: 15, color: ny.skog }
    : { flex: 1, fontSize: 14, fontWeight: '600', color: c.text },
  body: { paddingHorizontal: 14, paddingBottom: 10 },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: nyD ? ny.kontur : c.surfaceSubtle },
  eventText: { fontSize: 13, color: nyD ? ny.text : c.textSecondary, lineHeight: 18 },
  eventTime: { fontSize: 11, color: nyD ? ny.textDampad : c.textFaint, marginTop: 2 },
  empty: { fontSize: 13, color: nyD ? ny.textDampad : c.textFaint, textAlign: 'center', paddingVertical: 16, fontStyle: 'italic' },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, marginTop: 4 },
  refreshText: { fontSize: 12, color: nyD ? ny.skog : c.textMuted },
});
