export type QuestionType = 'mcq' | 'fill_blank';
export type SessionMode = 'drill' | 'missed' | 'topic' | 'mock_exam';
export type Difficulty = 1 | 2 | 3;

export interface Question {
  id: string;
  prompt: string;
  type: QuestionType;
  choices: string[];
  answer: string;
  explanation: string;
  foreman_explanation: string;
  code_section: string;
  topic: string;
  difficulty: Difficulty;
  tags: string[];
  source: string;
  verified: boolean;
}

export interface CodeSection {
  id: string;
  section: string;
  title: string;
  short_summary: string;
  keywords: string[];
}

export interface QuestionAttempt {
  id: string;
  question_id: string;
  selected_answer: string;
  is_correct: boolean;
  response_time_ms: number;
  session_id: string;
  attempted_at: string;
}

export interface StudySession {
  id: string;
  mode: SessionMode;
  topic_filter: string | null;
  question_count: number;
  correct_count: number;
  total_time_ms: number;
  started_at: string;
  completed_at: string | null;
}

export interface UserProgress {
  question_id: string;
  times_seen: number;
  times_correct: number;
  accuracy: number;
  last_seen: string;
  next_review: string;
  confidence_level: number;
  bookmarked: boolean;
}

export interface TopicStats {
  topic: string;
  total_questions: number;
  attempted: number;
  correct: number;
  accuracy: number;
}

export interface DrillState {
  questions: Question[];
  currentIndex: number;
  answers: { questionId: string; selected: string; correct: boolean; timeMs: number }[];
  sessionId: string;
  mode: SessionMode;
  startTime: number;
}
