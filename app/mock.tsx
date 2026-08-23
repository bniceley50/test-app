import { useEffect, useRef, useState } from 'react';
import { Alert, View, Text, TouchableOpacity, StyleSheet, ScrollView, SafeAreaView, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { answerMatches } from '@/lib/normalize';
import {
  getDeckWithDue,
  recordAttempt,
  createSession,
  completeSession,
} from '@/lib/database';
import { Question } from '@/lib/types';
import { uid } from '@/lib/uid';

// Locked decisions: 25 Q = 75 min, 50 Q = 150 min (3 min/question pace).
// If the verified bank is smaller than the picker count, time scales with the
// actual question count (3 min/Q) and setup says so plainly.
const MODES = [
  { label: '25 questions', count: 25, minutes: 75 },
  { label: '50 questions', count: 50, minutes: 150 },
] as const;

const PASS_LINE = 80;

type Phase = 'setup' | 'exam' | 'results';

interface AnswerRecord {
  selected: string | null;
  timeMs: number;
  correct: boolean;
}

interface ResultRow {
  topic: string;
  correct: number;
  total: number;
}

export default function MockExamScreen() {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>('setup');
  const [selectedMode, setSelectedMode] = useState<(typeof MODES)[number] | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerRecord>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  const [timeTakenMs, setTimeTakenMs] = useState(0);
  const [fillValue, setFillValue] = useState('');

  const endTsRef = useRef(0);
  const sessionIdRef = useRef('');
  const startedAtRef = useRef(0);
  const qStartRef = useRef(0);
  const submittingRef = useRef(false);
  const lastModeRef = useRef<(typeof MODES)[number] | null>(null);

  const question = questions[currentIndex];

  // Reset the fill-in-the-blank input whenever the question changes.
  useEffect(() => {
    setFillValue('');
  }, [currentIndex]);

  // The interval below outlives many renders; always call the LATEST
  // submitExam so auto-submit scores the live answers, not the stale
  // closure captured when the timer effect first ran.
  const submitRef = useRef<(auto: boolean) => Promise<void>>(() => Promise.resolve());
  submitRef.current = submitExam;

  // --- Timer ---
  useEffect(() => {
    if (phase !== 'exam') return;
    const tick = () => {
      const remaining = endTsRef.current - Date.now();
      setRemainingMs(Math.max(0, remaining));
      if (remaining <= 0) {
        void submitRef.current?.(true);
      }
    };
    tick();
    const iv = setInterval(tick, 500);
    return () => clearInterval(iv);
  }, [phase]);

  // --- Start ---
  async function startExam(mode: (typeof MODES)[number]) {
    setLoading(true);
    setLoadError(null);
    try {
      // 3 min/q pace, capped by the mode's full time (bank may be smaller now).
      // Spaced-rep: overdue questions blend to the TOP of the mock deck too.
      const qs = await getDeckWithDue(mode.count, null);
      if (qs.length === 0) {
        setLoadError('No verified questions are available yet.');
        return;
      }
      const minutes = Math.min(mode.minutes, Math.round(qs.length * (mode.minutes / mode.count)));
      const durationMs = minutes * 60 * 1000;

      lastModeRef.current = mode;
      sessionIdRef.current = uid();
      startedAtRef.current = Date.now();
      qStartRef.current = Date.now();
      submittingRef.current = false;
      setAnswers({});
      setCurrentIndex(0);
      setQuestions(qs);
      setSelectedMode(mode);
      setAutoSubmitted(false);
      setRemainingMs(durationMs);
      endTsRef.current = Date.now() + durationMs;

      await createSession({
        id: sessionIdRef.current,
        mode: 'mock_exam',
        topic_filter: null,
        question_count: qs.length,
        correct_count: 0,
        total_time_ms: 0,
        started_at: new Date().toISOString(),
        completed_at: null,
      });

      setPhase('exam');
    } catch (e) {
      console.error('Error starting mock exam:', e);
      setLoadError('Could not start the exam. Try again.');
    } finally {
      setLoading(false);
    }
  }

  // --- Answer (NO feedback — locked: answers are hidden until submit) ---
  function choose(selected: string) {
    if (!question || phase !== 'exam' || !selected) return;
    recordAttemptNow(question, selected);
    advance();
  }

  function skip() {
    if (!question || phase !== 'exam') return;
    advance(); // unanswered → recorded blank on submit
  }

  function recordAttemptNow(q: Question, selected: string) {
    const timeMs = Date.now() - qStartRef.current;
    // Fill-in-the-blank uses normalized matching; MCQ is exact.
    const correct = q.type === 'fill_blank'
      ? answerMatches(q.answer, selected)
      : selected === q.answer;
    setAnswers(prev => ({ ...prev, [q.id]: { selected, timeMs, correct } }));
    void recordAttempt({
      id: uid(),
      question_id: q.id,
      selected_answer: selected,
      is_correct: correct,
      response_time_ms: timeMs,
      session_id: sessionIdRef.current,
      attempted_at: new Date().toISOString(),
    });
  }

  function advance() {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(i => i + 1);
      qStartRef.current = Date.now();
    }
  }

  function requestSubmit() {
    Alert.alert(
      'Submit exam?',
      'Unanswered questions will count as incorrect. Answers will be shown after submission.',
      [
        { text: 'Not yet', style: 'cancel' },
        { text: 'Submit', style: 'destructive', onPress: () => void submitExam(false) },
      ]
    );
  }

  async function submitExam(auto: boolean) {
    if (submittingRef.current || phase !== 'exam') return;
    submittingRef.current = true;
    setAutoSubmitted(auto);
    const now = Date.now();
    const timeTaken = now - startedAtRef.current;

    // Record any unanswered questions as blank/wrong (once each).
    for (const q of questions) {
      if (answers[q.id]) continue;
      try {
        await recordAttempt({
          id: uid(),
          question_id: q.id,
          selected_answer: '',
          is_correct: false,
          response_time_ms: now - qStartRef.current,
          session_id: sessionIdRef.current,
          attempted_at: new Date().toISOString(),
        });
      } catch (e) {
        console.error('Error recording blank answer:', e);
      }
    }

    const correctCount = questions.filter(q => answers[q.id]?.correct === true).length;
    try {
      await completeSession(sessionIdRef.current, correctCount, timeTaken);
    } catch (e) {
      console.error('Error completing session:', e);
    }

    setTimeTakenMs(timeTaken);
    setRemainingMs(Math.max(0, endTsRef.current - now));
    setPhase('results');
  }

  // --- Setup phase ---
  if (phase === 'setup') {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView style={styles.flex1} contentContainerStyle={styles.setupContent}>
          <Text style={styles.setupTitle}>Mock Exam</Text>
          <Text style={styles.setupSub}>
            Closed-book conditions: no feedback during the exam, a live countdown,
            and auto-submit at zero. Pass line: {PASS_LINE}%.
          </Text>

          {MODES.map(m => (
            <TouchableOpacity
              key={m.label}
              style={[styles.modeCard, selectedMode?.label === m.label && styles.modeCardActive,
                loading && styles.modeCardDisabled]}
              onPress={() => !loading && startExam(m)}
              activeOpacity={0.85}
            >
              <Text style={styles.modeLabel}>{m.label}</Text>
              <Text style={styles.modeDetail}>
                {m.minutes} min · ~3 min per question
              </Text>
              <Text style={styles.modeHint}>
                {m.count === 50
                  ? 'Bank currently has 41 verified Q — exam will run 41 Q / 123 min until content grows.'
                  : 'Drawn from all verified topics.'}
              </Text>
            </TouchableOpacity>
          ))}

          {loadError && (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{loadError}</Text>
            </View>
          )}

          {loading && <Text style={styles.loadingText}>Preparing your exam...</Text>}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // --- Exam phase ---
  if (phase === 'exam' && question) {
    const remaining = Math.ceil(remainingMs / 1000);
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    const answeredCount = Object.keys(answers).length;
    const lowTime = remainingMs <= 5 * 60 * 1000;

    return (
      <SafeAreaView style={styles.container}>
        {/* Exam header: timer + progress */}
        <View style={styles.examHeader}>
          <Text style={[styles.timer, lowTime && styles.timerLow]}>
            {mins}:{String(secs).padStart(2, '0')}
          </Text>
          <Text style={styles.examProgress}>
            {currentIndex + 1} / {questions.length}
          </Text>
          <Text style={styles.examAnswered}>{`${answeredCount} answered`}</Text>
        </View>

        <ScrollView style={styles.flex1} contentContainerStyle={styles.examContent}>
          <View style={styles.examMetaRow}>
            <Text style={styles.examTopic}>{question.topic.replace(/_/g, ' ').toUpperCase()}</Text>
            <Text style={styles.examDifficulty}>{'★'.repeat(question.difficulty)}{'☆'.repeat(3 - question.difficulty)}</Text>
          </View>
          <Text style={styles.examPrompt}>{question.prompt}</Text>

          {question.type === 'fill_blank' ? (
            <View>
              <TextInput
                style={styles.fillInput}
                placeholder="Type your answer…"
                placeholderTextColor="#5a607a"
                value={fillValue}
                onChangeText={setFillValue}
                autoCapitalize="words"
                multiline
                textAlignVertical="center"
                editable={!answers[question.id]}
              />
              <TouchableOpacity
                style={styles.mockChoice}
                onPress={() => {
                  const v = fillValue.trim();
                  if (v) choose(v);
                }}
                disabled={!!answers[question.id]}
                activeOpacity={0.7}
              >
                <Text style={styles.mockChoiceText}>Lock in answer</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
          {question.choices.map((choice, i) => {
            const letter = String.fromCharCode(65 + i);
            const picked = answers[question.id]?.selected === choice;
            const already = !!answers[question.id];
            return (
              <TouchableOpacity
                key={i}
                style={[styles.mockChoice, picked && styles.mockChoicePicked, already && styles.mockChoiceLocked]}
                onPress={() => choose(choice)}
                disabled={already}
                activeOpacity={0.7}
              >
                <View style={[styles.mockLetter, picked && styles.mockLetterPicked]}>
                  <Text style={styles.mockLetterText}>{letter}</Text>
                </View>
                <Text style={styles.mockChoiceText}>{choice}</Text>
              </TouchableOpacity>
            );
          })}
            </View>
          )}

          {/* Navigation */}
          <View style={styles.examNavRow}>
            <TouchableOpacity style={styles.skipBtn} onPress={skip} activeOpacity={0.7}>
              <Text style={styles.skipText}>Skip (leave blank)</Text>
            </TouchableOpacity>
            {currentIndex === questions.length - 1 && (
              <TouchableOpacity style={styles.submitBtn} onPress={requestSubmit} activeOpacity={0.85}>
                <Text style={styles.submitText}>Submit exam</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (phase === 'exam') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerBox}>
          <Text style={styles.loadingText}>Exam starting...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // --- Results phase ---
  const total = questions.length;
  const correctCount = questions.filter(q => answers[q.id]?.correct === true).length;
  const pct = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  const passed = pct >= PASS_LINE;

  // Per-topic breakdown
  const byTopic = new Map<string, ResultRow>();
  for (const q of questions) {
    const row = byTopic.get(q.topic) || { topic: q.topic, correct: 0, total: 0 };
    row.total += 1;
    if (answers[q.id]?.correct === true) row.correct += 1;
    byTopic.set(q.topic, row);
  }
  const rows: ResultRow[] = Array.from(byTopic.values()).sort((a, b) =>
    b.total - a.total || a.topic.localeCompare(b.topic)
  );

  const minsTaken = Math.floor(timeTakenMs / 60000);
  const secsTaken = Math.floor((timeTakenMs % 60000) / 1000);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.flex1} contentContainerStyle={styles.resultsContent}>
        {autoSubmitted && (
          <View style={styles.autoBanner}>
            <Text style={styles.autoText}>Time expired — exam was auto-submitted.</Text>
          </View>
        )}

        {/* Score */}
        <View style={[styles.scoreCircle, passed ? styles.scorePass : styles.scoreFail]}>
          <Text style={styles.scoreNumber}>{pct}%</Text>
          <Text style={styles.scoreVerdict}>{passed ? 'PASSING' : 'BELOW PASS LINE'}</Text>
        </View>
        <Text style={styles.resultMeta}>
          {correctCount} / {total} correct · {minsTaken}:{String(secsTaken).padStart(2, '0')} elapsed
          {selectedMode && questions.length < selectedMode.count
            ? ` · ${questions.length} of ${selectedMode.count} (bank size)`
            : ''}
        </Text>

        <Text style={styles.resultsTitle}>By topic</Text>
        <View style={styles.breakdownList}>
          {rows.map(r => {
            const p = r.total > 0 ? Math.round((r.correct / r.total) * 100) : 0;
            const color = p >= PASS_LINE ? '#4caf50' : p >= 60 ? '#ff9800' : '#f44336';
            return (
              <View key={r.topic} style={styles.breakdownRow}>
                <View style={styles.breakdownRowTop}>
                  <Text style={styles.breakdownTopic}>{r.topic.replace(/_/g, ' ').toUpperCase()}</Text>
                  <Text style={styles.breakdownScore}>
                    {r.correct}/{r.total}
                  </Text>
                </View>
                <View style={styles.breakdownBarBg}>
                  <View style={[styles.breakdownBarFill, { width: `${p}%`, backgroundColor: color }]} />
                </View>
              </View>
            );
          })}
        </View>

        {/* Missed review */}
        <Text style={styles.resultsTitle}>Review missed</Text>
        {questions.filter(q => !(answers[q.id]?.correct === true)).length === 0 ? (
          <Text style={styles.resultsNone}>None — clean sheet.</Text>
        ) : (
          questions
            .filter(q => !(answers[q.id]?.correct === true))
            .map(q => (
              <View key={q.id} style={styles.reviewCard}>
                <Text style={styles.reviewPrompt}>{q.prompt}</Text>
                {answers[q.id]?.selected == null ? (
                  <Text style={styles.reviewAnswer}>Not answered</Text>
                ) : (
                  <Text style={styles.reviewAnswer}>Your answer: {answers[q.id].selected}</Text>
                )}
                <Text style={styles.reviewCorrect}>Correct: {q.answer}</Text>
                {q.explanation ? <Text style={styles.reviewExpl}>{q.explanation}</Text> : null}
              </View>
            ))
        )}

        <View style={styles.resultsNav}>
          <TouchableOpacity
            style={styles.resultsBtn}
            onPress={() => router.replace('/(tabs)')}
            activeOpacity={0.85}
          >
            <Text style={styles.resultsBtnText}>Back to Home</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.resultsBtn, styles.resultsBtnSecondary]}
            onPress={() => router.replace('/missed')}
            activeOpacity={0.85}
          >
            <Text style={styles.resultsBtnTextSecondary}>Drill my misses</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#16213e' },
  flex1: { flex: 1 },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#8892b0', fontSize: 15 },

  setupContent: { padding: 16, paddingBottom: 40 },
  setupTitle: { color: '#fff', fontSize: 26, fontWeight: 'bold', marginBottom: 8 },
  setupSub: { color: '#a7adc9', fontSize: 14, lineHeight: 20, marginBottom: 20 },
  modeCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#2a2a4e',
    padding: 18,
    marginBottom: 14,
  },
  modeCardActive: { borderColor: '#4fc3f7' },
  modeCardDisabled: { opacity: 0.6 },
  modeLabel: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 4 },
  modeDetail: { color: '#4fc3f7', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  modeHint: { color: '#8892b0', fontSize: 12 },

  examHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    backgroundColor: '#1a1a2e',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  timer: { color: '#4fc3f7', fontSize: 20, fontWeight: 'bold', fontVariant: ['tabular-nums'] },
  timerLow: { color: '#f44336' },
  examProgress: { color: '#fff', fontSize: 15, fontWeight: '600' },
  examAnswered: { color: '#8892b0', fontSize: 12 },
  examContent: { padding: 16, paddingBottom: 48 },
  examMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  examTopic: { color: '#4fc3f7', fontSize: 12, fontWeight: '600', backgroundColor: '#1a1a2e', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  examDifficulty: { color: '#ff9800', fontSize: 14 },
  examPrompt: { color: '#fff', fontSize: 18, lineHeight: 26, marginBottom: 22 },
  mockChoice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2a2a4e',
  },
  mockChoicePicked: { borderColor: '#4fc3f7', backgroundColor: '#232648' },
  mockLetter: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#2a2a4e',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  mockLetterText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  mockChoiceText: { color: '#ddd', fontSize: 15, flex: 1 },
  mockLetterPicked: { backgroundColor: '#4fc3f7' },
  mockChoiceLocked: { opacity: 0.75 },
  fillInput: {
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#2a2a4e',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 16,
    minHeight: 56,
    marginBottom: 10,
  },
  examNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    paddingVertical: 4,
  },
  skipBtn: { paddingHorizontal: 4 },
  skipText: { color: '#8892b0', fontSize: 13 },
  submitBtn: {
    backgroundColor: '#4fc3f7',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  submitText: { color: '#1a1a2e', fontSize: 15, fontWeight: 'bold' },

  resultsContent: { padding: 16, paddingBottom: 40 },
  autoBanner: {
    backgroundColor: '#3a1b1b',
    borderWidth: 1,
    borderColor: '#f44336',
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
  },
  autoText: { color: '#f44336', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  scoreCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 14,
  },
  scorePass: { borderColor: '#4caf50', backgroundColor: '#1b3a1b' },
  scoreFail: { borderColor: '#f44336', backgroundColor: '#3a1b1b' },
  scoreNumber: { fontSize: 42, fontWeight: 'bold', color: '#fff' },
  scoreVerdict: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, color: '#ccc', marginTop: 2 },
  resultMeta: { color: '#8892b0', fontSize: 13, textAlign: 'center', marginBottom: 24 },
  resultsTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 12, marginTop: 8 },
  breakdownList: { marginBottom: 16 },
  breakdownRow: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  breakdownRowTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  breakdownTopic: { color: '#e8eaf6', fontSize: 13, fontWeight: '600' },
  breakdownScore: { color: '#8892b0', fontSize: 13, fontWeight: '600' },
  breakdownBarBg: { height: 6, borderRadius: 3, backgroundColor: '#2a2a4e', overflow: 'hidden' },
  breakdownBarFill: { height: '10%', borderRadius: 3, alignSelf: 'stretch' },
  resultsNone: { color: '#4caf50', fontSize: 14, fontWeight: '600' },
  reviewCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#f44336',
  },
  reviewPrompt: { color: '#e8eaf6', fontSize: 14, lineHeight: 20, marginBottom: 8 },
  reviewAnswer: { color: '#f44336', fontSize: 13, marginBottom: 4 },
  reviewCorrect: { color: '#4caf50', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  reviewExpl: { color: '#a7adc9', fontSize: 13, lineHeight: 19 },
  resultsNav: { marginTop: 24, gap: 10 },
  resultsBtn: {
    backgroundColor: '#4fc3f7',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
  },
  resultsBtnText: { color: '#1a1a2e', fontSize: 16, fontWeight: 'bold' },
  resultsBtnSecondary: { backgroundColor: '#1a1a2e', borderWidth: 1, borderColor: '#4fc3f7' },
  resultsBtnTextSecondary: { color: '#4fc3f7', fontSize: 15, fontWeight: '600' },

  errorCard: { backgroundColor: '#3a1b1b', borderRadius: 12, padding: 12, marginTop: 8, borderWidth: 1, borderColor: '#f44336' },
  errorText: { color: '#f44336', fontSize: 14 },
});
