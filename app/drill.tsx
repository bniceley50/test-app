import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, SafeAreaView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAppStore } from '@/lib/store';
import { getDrillQuestions, getTopicQuestions, recordAttempt, createSession, completeSession } from '@/lib/database';
import { uid } from '@/lib/uid';

export default function DrillScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ topic?: string }>();
  const { drill, startDrill, answerQuestion, nextQuestion, endDrill, showExplanation, showForemanMode } = useAppStore();
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadQuestions();
  }, []);

  async function loadQuestions() {
    try {
      const questions = params.topic
        ? await getTopicQuestions(params.topic, 10)
        : await getDrillQuestions(10);

      if (questions.length === 0) {
        alert('No questions available yet.');
        router.back();
        return;
      }

      startDrill(questions, params.topic ? 'topic' : 'drill');

      const session = {
        id: uid(),
        mode: params.topic ? 'topic' as const : 'drill' as const,
        topic_filter: params.topic || null,
        question_count: questions.length,
        correct_count: 0,
        total_time_ms: 0,
        started_at: new Date().toISOString(),
        completed_at: null,
      };
      await createSession(session);
    } catch (e) {
      console.error('Error loading questions:', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleAnswer(selected: string) {
    if (!drill || showExplanation) return;
    const question = drill.questions[drill.currentIndex];
    const correct = selected === question.answer;
    const timeMs = Date.now() - questionStartTime;

    answerQuestion(selected, correct, timeMs);

    await recordAttempt({
      id: uid(),
      question_id: question.id,
      selected_answer: selected,
      is_correct: correct,
      response_time_ms: timeMs,
      session_id: drill.sessionId,
      attempted_at: new Date().toISOString(),
    });
  }

  async function handleNext() {
    if (!drill) return;
    const isLast = drill.currentIndex >= drill.questions.length - 1;

    if (isLast) {
      const correctCount = drill.answers.filter(a => a.correct).length;
      const totalTime = Date.now() - drill.startTime;
      await completeSession(drill.sessionId, correctCount, totalTime);

      router.replace({
        pathname: '/results',
        params: {
          correct: correctCount.toString(),
          total: drill.questions.length.toString(),
          timeMs: totalTime.toString(),
          mode: drill.mode,
        },
      });
      endDrill();
    } else {
      nextQuestion();
      setQuestionStartTime(Date.now());
    }
  }

  if (loading || !drill) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading questions...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const question = drill.questions[drill.currentIndex];
  const progress = `${drill.currentIndex + 1} / ${drill.questions.length}`;
  const answered = drill.answers.find(a => a.questionId === question.id);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { endDrill(); router.back(); }}>
          <Text style={styles.closeButton}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.progress}>{progress}</Text>
        <View style={styles.progressDots}>
          {drill.questions.map((_, i) => (
            <View key={i} style={[
              styles.dot,
              i < drill.answers.length
                ? (drill.answers[i]?.correct ? styles.dotCorrect : styles.dotWrong)
                : i === drill.currentIndex ? styles.dotCurrent : styles.dotPending,
            ]} />
          ))}
        </View>
      </View>

      <ScrollView style={styles.questionArea} contentContainerStyle={styles.questionContent}>
        {/* Topic Badge */}
        <View style={styles.topicBadge}>
          <Text style={styles.topicText}>{question.topic.replace('_', ' ').toUpperCase()}</Text>
          <Text style={styles.difficultyText}>
            {'★'.repeat(question.difficulty)}{'☆'.repeat(3 - question.difficulty)}
          </Text>
        </View>

        {/* Question */}
        <Text style={styles.questionText}>{question.prompt}</Text>

        {/* Choices */}
        {question.choices.map((choice, index) => {
          const letter = String.fromCharCode(65 + index);
          const isSelected = answered?.selected === choice;
          const isCorrect = choice === question.answer;
          const showResult = showExplanation;

          let choiceStyle = styles.choice;
          if (showResult && isCorrect) choiceStyle = { ...styles.choice, ...styles.choiceCorrect };
          else if (showResult && isSelected && !isCorrect) choiceStyle = { ...styles.choice, ...styles.choiceWrong };

          return (
            <TouchableOpacity
              key={index}
              style={[choiceStyle]}
              onPress={() => handleAnswer(choice)}
              disabled={showExplanation}
              activeOpacity={0.7}
            >
              <View style={[
                styles.choiceLetter,
                showResult && isCorrect && styles.choiceLetterCorrect,
                showResult && isSelected && !isCorrect && styles.choiceLetterWrong,
              ]}>
                <Text style={styles.choiceLetterText}>{letter}</Text>
              </View>
              <Text style={[
                styles.choiceText,
                showResult && isCorrect && styles.choiceTextCorrect,
                showResult && isSelected && !isCorrect && styles.choiceTextWrong,
              ]}>{choice}</Text>
            </TouchableOpacity>
          );
        })}

        {/* Explanation */}
        {showExplanation && (
          <View style={styles.explanationCard}>
            <Text style={[styles.resultBanner, answered?.correct ? styles.correctBanner : styles.wrongBanner]}>
              {answered?.correct ? 'Correct!' : 'Wrong'}
            </Text>

            <Text style={styles.explanationTitle}>Why?</Text>
            <Text style={styles.explanationText}>{question.explanation}</Text>

            {showForemanMode && question.foreman_explanation && (
              <>
                <Text style={styles.foremanTitle}>Foreman Says:</Text>
                <Text style={styles.foremanText}>{question.foreman_explanation}</Text>
              </>
            )}

            {question.code_section && (
              <View style={styles.codeRefCard}>
                <Text style={styles.codeRefLabel}>Code Reference</Text>
                <Text style={styles.codeRefSection}>Section {question.code_section}</Text>
              </View>
            )}

            <TouchableOpacity style={styles.nextButton} onPress={handleNext} activeOpacity={0.8}>
              <Text style={styles.nextButtonText}>
                {drill.currentIndex >= drill.questions.length - 1 ? 'See Results' : 'Next Question'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#16213e',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#999',
    fontSize: 16,
  },
  header: {
    padding: 16,
    paddingTop: 8,
  },
  closeButton: {
    color: '#999',
    fontSize: 24,
    padding: 8,
  },
  progress: {
    color: '#4fc3f7',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
  },
  progressDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 8,
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotPending: {
    backgroundColor: '#2a2a4e',
  },
  dotCurrent: {
    backgroundColor: '#4fc3f7',
  },
  dotCorrect: {
    backgroundColor: '#4caf50',
  },
  dotWrong: {
    backgroundColor: '#f44336',
  },
  questionArea: {
    flex: 1,
  },
  questionContent: {
    padding: 16,
    paddingBottom: 40,
  },
  topicBadge: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  topicText: {
    color: '#4fc3f7',
    fontSize: 12,
    fontWeight: '600',
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  difficultyText: {
    color: '#ff9800',
    fontSize: 14,
  },
  questionText: {
    color: '#fff',
    fontSize: 18,
    lineHeight: 26,
    marginBottom: 24,
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2a2a4e',
  },
  choiceCorrect: {
    backgroundColor: '#1b3a1b',
    borderColor: '#4caf50',
  },
  choiceWrong: {
    backgroundColor: '#3a1b1b',
    borderColor: '#f44336',
  },
  choiceLetter: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2a2a4e',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  choiceLetterCorrect: {
    backgroundColor: '#4caf50',
  },
  choiceLetterWrong: {
    backgroundColor: '#f44336',
  },
  choiceLetterText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  choiceText: {
    color: '#ddd',
    fontSize: 15,
    flex: 1,
  },
  choiceTextCorrect: {
    color: '#4caf50',
    fontWeight: '600',
  },
  choiceTextWrong: {
    color: '#f44336',
  },
  explanationCard: {
    marginTop: 16,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
  },
  resultBanner: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
    paddingVertical: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  correctBanner: {
    color: '#4caf50',
    backgroundColor: '#1b3a1b',
  },
  wrongBanner: {
    color: '#f44336',
    backgroundColor: '#3a1b1b',
  },
  explanationTitle: {
    color: '#4fc3f7',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  explanationText: {
    color: '#ccc',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
  },
  foremanTitle: {
    color: '#ff9800',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  foremanText: {
    color: '#ddd',
    fontSize: 15,
    lineHeight: 22,
    fontStyle: 'italic',
    marginBottom: 16,
    backgroundColor: '#2a2000',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#ff9800',
  },
  codeRefCard: {
    backgroundColor: '#0d1b2a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#4fc3f7',
  },
  codeRefLabel: {
    color: '#4fc3f7',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  codeRefSection: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  codeRefText: {
    color: '#aaa',
    fontSize: 13,
    lineHeight: 18,
  },
  nextButton: {
    backgroundColor: '#4fc3f7',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  nextButtonText: {
    color: '#1a1a2e',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
