import { create } from 'zustand';
import { Question, DrillState, SessionMode, TopicStats } from './types';
import { v4 as uuid } from 'uuid';

interface AppStore {
  // Drill state
  drill: DrillState | null;
  startDrill: (questions: Question[], mode: SessionMode) => void;
  answerQuestion: (selected: string, correct: boolean, timeMs: number) => void;
  nextQuestion: () => void;
  endDrill: () => void;

  // Stats (cached from DB)
  overallStats: {
    totalQuestions: number;
    attempted: number;
    accuracy: number;
    streak: number;
    sessionsToday: number;
  };
  topicStats: TopicStats[];
  setOverallStats: (stats: AppStore['overallStats']) => void;
  setTopicStats: (stats: TopicStats[]) => void;

  // UI state
  showExplanation: boolean;
  showForemanMode: boolean;
  setShowExplanation: (show: boolean) => void;
  toggleForemanMode: () => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  // Drill
  drill: null,
  startDrill: (questions, mode) => set({
    drill: {
      questions,
      currentIndex: 0,
      answers: [],
      sessionId: uuid(),
      mode,
      startTime: Date.now(),
    },
    showExplanation: false,
  }),
  answerQuestion: (selected, correct, timeMs) => set(state => {
    if (!state.drill) return {};
    const question = state.drill.questions[state.drill.currentIndex];
    return {
      drill: {
        ...state.drill,
        answers: [...state.drill.answers, {
          questionId: question.id,
          selected,
          correct,
          timeMs,
        }],
      },
      showExplanation: true,
    };
  }),
  nextQuestion: () => set(state => {
    if (!state.drill) return {};
    return {
      drill: {
        ...state.drill,
        currentIndex: state.drill.currentIndex + 1,
      },
      showExplanation: false,
    };
  }),
  endDrill: () => set({ drill: null, showExplanation: false }),

  // Stats
  overallStats: { totalQuestions: 0, attempted: 0, accuracy: 0, streak: 0, sessionsToday: 0 },
  topicStats: [],
  setOverallStats: (stats) => set({ overallStats: stats }),
  setTopicStats: (stats) => set({ topicStats: stats }),

  // UI
  showExplanation: false,
  showForemanMode: true,
  setShowExplanation: (show) => set({ showExplanation: show }),
  toggleForemanMode: () => set(state => ({ showForemanMode: !state.showForemanMode })),
}));
