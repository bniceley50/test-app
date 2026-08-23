import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { getTopicStats } from '@/lib/database';
import { TopicStats } from '@/lib/types';

type Health = 'green' | 'yellow' | 'red' | 'neutral';

function healthFor(s: TopicStats): Health {
  if (s.attempted === 0) return 'neutral';
  if (s.accuracy > 80) return 'green';
  if (s.accuracy >= 60) return 'yellow';
  return 'red';
}

const healthColor: Record<Health, { bg: string; border: string; fg: string; label: string }> = {
  green: { bg: '#1b3a1b', border: '#4caf50', fg: '#4caf50', label: 'Strong' },
  yellow: { bg: '#3a2e1b', border: '#ff9800', fg: '#ff9800', label: 'Shaky' },
  red: { bg: '#3a1b1b', border: '#f44336', fg: '#f44336', label: 'Weak' },
  neutral: { bg: '#1a1a2e', border: '#2a2a4e', fg: '#8892b0', label: 'Untested' },
};

export default function TopicsScreen() {
  const router = useRouter();
  const [stats, setStats] = useState<TopicStats[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const s = await getTopicStats();
      setStats(s);
    } catch (e) {
      console.error('Error loading topic stats:', e);
      setError('Could not load topic stats.');
    } finally {
      setLoaded(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function pretty(topic: string): string {
    return topic.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#4fc3f7"
          colors={['#4fc3f7']}
        />
      }
    >
      {/* Legend */}
      <View style={styles.legend}>
        {(Object.keys(healthColor) as Health[]).map(h => (
          <View key={h} style={[styles.legendItem, { borderColor: healthColor[h].border }]}>
            <View style={[styles.legendDot, { backgroundColor: healthColor[h].border }]} />
            <Text style={styles.legendText}>
              {h === 'green' ? '> 80%' : h === 'yellow' ? '60–80%' : h === 'red' ? '< 60%' : 'Untested'}
            </Text>
          </View>
        ))}
      </View>
      <Text style={styles.hint}>Tap a topic to drill it. Your color updates as you answer.</Text>

      {error && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!loaded && <Text style={styles.loading}>Loading topics...</Text>}

      {/* Heat grid: 2-up */}
      <View style={styles.grid}>
        {stats.map(s => {
          const health = healthFor(s);
          const c = healthColor[health];
          return (
            <TouchableOpacity
              key={s.topic}
              style={[styles.card, { backgroundColor: c.bg, borderColor: c.border }]}
              onPress={() => router.push(`/drill?topic=${s.topic}`)}
              activeOpacity={0.8}
            >
              <Text style={styles.cardTopic} numberOfLines={2}>{pretty(s.topic)}</Text>
              <Text style={[styles.cardPct, { color: c.fg }]}>
                {s.attempted > 0 ? `${Math.round(s.accuracy)}%` : '—'}
              </Text>
              <Text style={styles.cardMeta}>
                {s.attempted > 0
                  ? `${s.correct}/${s.attempted} right · ${s.total_questions} in bank`
                  : `${s.total_questions} in bank · not tested`}
              </Text>
              <Text style={[styles.cardHealth, { color: c.fg }]}>{c.label.toUpperCase()}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loaded && stats.length === 0 && (
        <Text style={styles.empty}>No question topics yet — add content and they'll appear here.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#16213e' },
  content: { padding: 16, paddingBottom: 40 },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  legendItem: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1a1a2e',
  },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: '#ccc', fontSize: 11 },
  hint: { color: '#8892b0', fontSize: 12, marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  card: {
    width: '48.5%',
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 14,
    marginBottom: 12,
  },
  cardTopic: { color: '#fff', fontSize: 14, fontWeight: '600', minHeight: 34 },
  cardPct: { fontSize: 30, fontWeight: 'bold', marginTop: 4 },
  cardMeta: { color: '#9aa0b4', fontSize: 11, marginTop: 4, minHeight: 15 },
  cardHealth: { fontSize: 10, fontWeight: '700', marginTop: 10, letterSpacing: 1 },
  loading: { color: '#8892b0', fontSize: 14, textAlign: 'center', marginTop: 24 },
  empty: { color: '#8892b0', fontSize: 14, textAlign: 'center', marginTop: 24 },
  errorCard: { backgroundColor: '#3a1b1b', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#f44336' },
  errorText: { color: '#f44336', fontSize: 14 },
});
