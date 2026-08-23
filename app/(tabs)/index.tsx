import { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAppStore } from '@/lib/store';
import { getOverallStats, getMissedCount } from '@/lib/database';

export default function HomeScreen() {
  const router = useRouter();
  const { overallStats, setOverallStats } = useAppStore();
  const [missedCount, setMissedCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [])
  );

  async function loadStats() {
    try {
      const [stats, missed] = await Promise.all([getOverallStats(), getMissedCount()]);
      setOverallStats(stats);
      setMissedCount(missed);
    } catch (e) {
      console.error('Error loading stats:', e);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Streak & Quick Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{overallStats.streak}</Text>
          <Text style={styles.statLabel}>Day Streak</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{overallStats.accuracy}%</Text>
          <Text style={styles.statLabel}>Accuracy</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{overallStats.attempted}</Text>
          <Text style={styles.statLabel}>Studied</Text>
        </View>
      </View>

      {/* Main CTA */}
      <TouchableOpacity
        style={styles.drillButton}
        onPress={() => router.push('/drill')}
        activeOpacity={0.8}
      >
        <Text style={styles.drillButtonText}>Start Drill</Text>
        <Text style={styles.drillButtonSub}>10 questions, ~5 minutes</Text>
      </TouchableOpacity>

      {/* Secondary Actions */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => router.push('/missed')}
          activeOpacity={0.8}
        >
          <Text style={styles.actionIcon}>🔄</Text>
          <Text style={styles.actionTitle}>Missed Questions</Text>
          <Text style={styles.actionSub}>
            {missedCount > 0 ? `${missedCount} to review` : 'None yet'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => router.push('/mock')}
          activeOpacity={0.8}
        >
          <Text style={styles.actionIcon}>📝</Text>
          <Text style={styles.actionTitle}>Mock Exam</Text>
          <Text style={styles.actionSub}>25 or 50 Q · timed · 80% pass</Text>
        </TouchableOpacity>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressSection}>
        <Text style={styles.sectionTitle}>Overall Progress</Text>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, {
            width: overallStats.totalQuestions > 0
              ? `${Math.round((overallStats.attempted / overallStats.totalQuestions) * 100)}%`
              : '0%'
          }]} />
        </View>
        <Text style={styles.progressText}>
          {overallStats.attempted} / {overallStats.totalQuestions} questions studied
        </Text>
      </View>

      {/* Exam Info */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>KY Master Plumber Exam</Text>
        <Text style={styles.infoText}>~50 questions + pipe sizing drawing</Text>
        <Text style={styles.infoText}>2.5 hours | 80% to pass | Closed book</Text>
        <Text style={styles.infoHighlight}>~15% pass rate - you need to drill daily</Text>
      </View>

      {/* Sessions Today */}
      {overallStats.sessionsToday > 0 && (
        <View style={styles.todayCard}>
          <Text style={styles.todayText}>
            {overallStats.sessionsToday} session{overallStats.sessionsToday > 1 ? 's' : ''} today
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#16213e',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  statNumber: {
    color: '#4fc3f7',
    fontSize: 28,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#999',
    fontSize: 12,
    marginTop: 4,
  },
  drillButton: {
    backgroundColor: '#4fc3f7',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  drillButtonText: {
    color: '#1a1a2e',
    fontSize: 24,
    fontWeight: 'bold',
  },
  drillButtonSub: {
    color: '#1a1a2e',
    fontSize: 14,
    opacity: 0.7,
    marginTop: 4,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  actionCard: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 4,
  },
  actionCardDisabled: {
    opacity: 0.5,
  },
  actionIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  actionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  actionSub: {
    color: '#999',
    fontSize: 12,
    marginTop: 4,
  },
  progressSection: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#2a2a4e',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#4fc3f7',
    borderRadius: 4,
  },
  progressText: {
    color: '#999',
    fontSize: 12,
    marginTop: 8,
  },
  infoCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#ff9800',
  },
  infoTitle: {
    color: '#ff9800',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  infoText: {
    color: '#ccc',
    fontSize: 14,
    marginBottom: 4,
  },
  infoHighlight: {
    color: '#ff9800',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
  },
  todayCard: {
    backgroundColor: '#2e7d32',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  todayText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
