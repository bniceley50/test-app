import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

export default function ResultsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    correct: string;
    total: string;
    timeMs: string;
    mode: string;
  }>();

  const correct = parseInt(params.correct || '0', 10);
  const total = parseInt(params.total || '0', 10);
  const timeMs = parseInt(params.timeMs || '0', 10);
  const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
  const passing = percentage >= 80;
  const minutes = Math.floor(timeMs / 60000);
  const seconds = Math.floor((timeMs % 60000) / 1000);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Score Circle */}
        <View style={[styles.scoreCircle, passing ? styles.scorePass : styles.scoreFail]}>
          <Text style={styles.scorePercent}>{percentage}%</Text>
          <Text style={styles.scoreLabel}>{correct} / {total}</Text>
        </View>

        {/* Result Message */}
        <Text style={[styles.resultMessage, passing ? styles.passMessage : styles.failMessage]}>
          {passing ? 'Passing Score!' : 'Keep Drilling'}
        </Text>
        <Text style={styles.resultSub}>
          {passing
            ? 'You hit 80% — that\'s passing on the real exam.'
            : `You need 80% to pass. You got ${percentage}%. Keep at it.`}
        </Text>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{minutes}:{seconds.toString().padStart(2, '0')}</Text>
            <Text style={styles.statLabel}>Time</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{correct}</Text>
            <Text style={styles.statLabel}>Correct</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{total - correct}</Text>
            <Text style={styles.statLabel}>Missed</Text>
          </View>
        </View>

        {/* Actions */}
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.replace('/')}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryButtonText}>Back to Home</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.replace('/drill')}
          activeOpacity={0.8}
        >
          <Text style={styles.secondaryButtonText}>Drill Again</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#16213e',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  scoreCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    marginBottom: 24,
  },
  scorePass: {
    borderColor: '#4caf50',
    backgroundColor: '#1b3a1b',
  },
  scoreFail: {
    borderColor: '#f44336',
    backgroundColor: '#3a1b1b',
  },
  scorePercent: {
    color: '#fff',
    fontSize: 48,
    fontWeight: 'bold',
  },
  scoreLabel: {
    color: '#999',
    fontSize: 16,
    marginTop: 2,
  },
  resultMessage: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  passMessage: {
    color: '#4caf50',
  },
  failMessage: {
    color: '#f44336',
  },
  resultSub: {
    color: '#999',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 40,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    color: '#4fc3f7',
    fontSize: 24,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#999',
    fontSize: 12,
    marginTop: 4,
  },
  primaryButton: {
    backgroundColor: '#4fc3f7',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 48,
    marginBottom: 12,
    width: '100%',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#1a1a2e',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#4fc3f7',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 48,
    width: '100%',
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#4fc3f7',
    fontSize: 16,
    fontWeight: '600',
  },
});
