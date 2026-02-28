import * as SQLite from 'expo-sqlite';
import { Question, QuestionAttempt, StudySession, UserProgress, CodeSection, TopicStats } from './types';

let db: SQLite.SQLiteDatabase;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('plumber_prep.db');
    await initializeDatabase(db);
  }
  return db;
}

async function initializeDatabase(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      prompt TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'multiple_choice',
      choices TEXT NOT NULL DEFAULT '[]',
      correct_answer TEXT NOT NULL,
      explanation TEXT NOT NULL DEFAULT '',
      foreman_explanation TEXT NOT NULL DEFAULT '',
      code_section TEXT NOT NULL DEFAULT '',
      code_text TEXT NOT NULL DEFAULT '',
      topic TEXT NOT NULL DEFAULT '',
      difficulty INTEGER NOT NULL DEFAULT 2,
      tags TEXT NOT NULL DEFAULT '[]',
      reviewed_status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS question_attempts (
      id TEXT PRIMARY KEY,
      question_id TEXT NOT NULL,
      selected_answer TEXT NOT NULL,
      is_correct INTEGER NOT NULL DEFAULT 0,
      response_time_ms INTEGER NOT NULL DEFAULT 0,
      session_id TEXT NOT NULL,
      attempted_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (question_id) REFERENCES questions(id)
    );

    CREATE TABLE IF NOT EXISTS study_sessions (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL,
      topic_filter TEXT,
      question_count INTEGER NOT NULL DEFAULT 0,
      correct_count INTEGER NOT NULL DEFAULT 0,
      total_time_ms INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS user_progress (
      question_id TEXT PRIMARY KEY,
      times_seen INTEGER NOT NULL DEFAULT 0,
      times_correct INTEGER NOT NULL DEFAULT 0,
      accuracy REAL NOT NULL DEFAULT 0,
      last_seen TEXT NOT NULL DEFAULT (datetime('now')),
      next_review TEXT NOT NULL DEFAULT (datetime('now')),
      confidence_level INTEGER NOT NULL DEFAULT 0,
      bookmarked INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (question_id) REFERENCES questions(id)
    );

    CREATE TABLE IF NOT EXISTS code_sections (
      id TEXT PRIMARY KEY,
      section_number TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      full_text TEXT NOT NULL DEFAULT '',
      parent_section TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS bookmarks (
      id TEXT PRIMARY KEY,
      question_id TEXT,
      code_section_id TEXT,
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions(topic);
    CREATE INDEX IF NOT EXISTS idx_attempts_question ON question_attempts(question_id);
    CREATE INDEX IF NOT EXISTS idx_attempts_session ON question_attempts(session_id);
    CREATE INDEX IF NOT EXISTS idx_progress_next_review ON user_progress(next_review);
  `);
}

// --- Question Queries ---

export async function getQuestionCount(): Promise<number> {
  const db = await getDatabase();
  const result = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM questions');
  return result?.count ?? 0;
}

export async function seedQuestions(questions: Question[]): Promise<void> {
  const db = await getDatabase();
  const existing = await getQuestionCount();
  if (existing > 0) return;

  for (const q of questions) {
    await db.runAsync(
      `INSERT OR IGNORE INTO questions (id, prompt, type, choices, correct_answer, explanation, foreman_explanation, code_section, code_text, topic, difficulty, tags, reviewed_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      q.id, q.prompt, q.type, JSON.stringify(q.choices), q.correct_answer,
      q.explanation, q.foreman_explanation, q.code_section, q.code_text,
      q.topic, q.difficulty, JSON.stringify(q.tags), q.reviewed_status
    );
  }
}

export async function seedCodeSections(sections: CodeSection[]): Promise<void> {
  const db = await getDatabase();
  const result = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM code_sections');
  if ((result?.count ?? 0) > 0) return;

  for (const s of sections) {
    await db.runAsync(
      `INSERT OR IGNORE INTO code_sections (id, section_number, title, summary, full_text, parent_section, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      s.id, s.section_number, s.title, s.summary, s.full_text, s.parent_section, s.sort_order
    );
  }
}

export async function getDrillQuestions(count: number = 10): Promise<Question[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM questions ORDER BY RANDOM() LIMIT ?`, count
  );
  return rows.map(parseQuestionRow);
}

export async function getTopicQuestions(topic: string, count: number = 10): Promise<Question[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM questions WHERE topic = ? ORDER BY RANDOM() LIMIT ?`, topic, count
  );
  return rows.map(parseQuestionRow);
}

export async function getMissedQuestions(count: number = 10): Promise<Question[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT q.* FROM questions q
     INNER JOIN user_progress p ON q.id = p.question_id
     WHERE p.times_seen > 0 AND p.accuracy < 1.0
     ORDER BY p.accuracy ASC, p.last_seen ASC
     LIMIT ?`, count
  );
  return rows.map(parseQuestionRow);
}

export async function getMockExamQuestions(count: number = 50): Promise<Question[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM questions ORDER BY RANDOM() LIMIT ?`, count
  );
  return rows.map(parseQuestionRow);
}

function parseQuestionRow(row: any): Question {
  return {
    ...row,
    choices: JSON.parse(row.choices || '[]'),
    tags: JSON.parse(row.tags || '[]'),
    difficulty: row.difficulty as 1 | 2 | 3,
  };
}

// --- Attempt & Progress Queries ---

export async function recordAttempt(attempt: QuestionAttempt): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO question_attempts (id, question_id, selected_answer, is_correct, response_time_ms, session_id, attempted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    attempt.id, attempt.question_id, attempt.selected_answer,
    attempt.is_correct ? 1 : 0, attempt.response_time_ms,
    attempt.session_id, attempt.attempted_at
  );

  // Update user_progress
  await db.runAsync(
    `INSERT INTO user_progress (question_id, times_seen, times_correct, accuracy, last_seen, next_review, confidence_level, bookmarked)
     VALUES (?, 1, ?, ?, datetime('now'), datetime('now', '+1 day'), 0, 0)
     ON CONFLICT(question_id) DO UPDATE SET
       times_seen = times_seen + 1,
       times_correct = times_correct + ?,
       accuracy = CAST((times_correct + ?) AS REAL) / (times_seen + 1),
       last_seen = datetime('now'),
       next_review = CASE
         WHEN ? = 1 THEN datetime('now', '+' || MIN(CAST(POWER(2, times_correct) AS INTEGER), 30) || ' days')
         ELSE datetime('now', '+1 day')
       END`,
    attempt.question_id,
    attempt.is_correct ? 1 : 0,
    attempt.is_correct ? 1.0 : 0.0,
    attempt.is_correct ? 1 : 0,
    attempt.is_correct ? 1 : 0,
    attempt.is_correct ? 1 : 0
  );
}

// --- Session Queries ---

export async function createSession(session: StudySession): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO study_sessions (id, mode, topic_filter, question_count, correct_count, total_time_ms, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    session.id, session.mode, session.topic_filter, session.question_count,
    session.correct_count, session.total_time_ms, session.started_at
  );
}

export async function completeSession(sessionId: string, correctCount: number, totalTimeMs: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE study_sessions SET completed_at = datetime('now'), correct_count = ?, total_time_ms = ? WHERE id = ?`,
    correctCount, totalTimeMs, sessionId
  );
}

// --- Stats Queries ---

export async function getTopicStats(): Promise<TopicStats[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<TopicStats>(
    `SELECT
       q.topic,
       COUNT(DISTINCT q.id) as total_questions,
       COUNT(DISTINCT p.question_id) as attempted,
       COALESCE(SUM(p.times_correct), 0) as correct,
       CASE
         WHEN COUNT(DISTINCT p.question_id) = 0 THEN 0
         ELSE ROUND(CAST(SUM(CASE WHEN p.accuracy >= 1.0 THEN 1 ELSE 0 END) AS REAL) / COUNT(DISTINCT p.question_id) * 100, 1)
       END as accuracy
     FROM questions q
     LEFT JOIN user_progress p ON q.id = p.question_id
     GROUP BY q.topic
     ORDER BY accuracy ASC`
  );
  return rows;
}

export async function getOverallStats(): Promise<{
  totalQuestions: number;
  attempted: number;
  accuracy: number;
  streak: number;
  sessionsToday: number;
}> {
  const db = await getDatabase();
  const total = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM questions');
  const attempted = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(DISTINCT question_id) as count FROM user_progress WHERE times_seen > 0'
  );
  const accuracyResult = await db.getFirstAsync<{ avg_acc: number }>(
    'SELECT COALESCE(AVG(accuracy), 0) as avg_acc FROM user_progress WHERE times_seen > 0'
  );
  const sessionsToday = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM study_sessions WHERE date(started_at) = date('now')`
  );

  // Simple streak: count consecutive days with sessions
  const days = await db.getAllAsync<{ day: string }>(
    `SELECT DISTINCT date(started_at) as day FROM study_sessions ORDER BY day DESC LIMIT 30`
  );
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < days.length; i++) {
    const expected = new Date(today);
    expected.setDate(expected.getDate() - i);
    const expectedStr = expected.toISOString().split('T')[0];
    if (days[i].day === expectedStr) {
      streak++;
    } else {
      break;
    }
  }

  return {
    totalQuestions: total?.count ?? 0,
    attempted: attempted?.count ?? 0,
    accuracy: Math.round((accuracyResult?.avg_acc ?? 0) * 100),
    streak,
    sessionsToday: sessionsToday?.count ?? 0,
  };
}

export async function getMissedCount(): Promise<number> {
  const db = await getDatabase();
  const result = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM user_progress WHERE times_seen > 0 AND accuracy < 1.0`
  );
  return result?.count ?? 0;
}

// --- Code Section Queries ---

export async function getAllCodeSections(): Promise<CodeSection[]> {
  const db = await getDatabase();
  return db.getAllAsync<CodeSection>('SELECT * FROM code_sections ORDER BY sort_order');
}

export async function searchCodeSections(query: string): Promise<CodeSection[]> {
  const db = await getDatabase();
  const pattern = `%${query}%`;
  return db.getAllAsync<CodeSection>(
    `SELECT * FROM code_sections WHERE title LIKE ? OR summary LIKE ? OR full_text LIKE ? ORDER BY sort_order`,
    pattern, pattern, pattern
  );
}

export async function getQuestionsForCodeSection(sectionNumber: string): Promise<Question[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM questions WHERE code_section = ?`, sectionNumber
  );
  return rows.map(parseQuestionRow);
}

// --- Bookmark Queries ---

export async function toggleBookmark(questionId: string): Promise<boolean> {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<{ bookmarked: number }>(
    'SELECT bookmarked FROM user_progress WHERE question_id = ?', questionId
  );
  const newValue = existing ? (existing.bookmarked ? 0 : 1) : 1;

  await db.runAsync(
    `INSERT INTO user_progress (question_id, times_seen, times_correct, accuracy, last_seen, next_review, confidence_level, bookmarked)
     VALUES (?, 0, 0, 0, datetime('now'), datetime('now'), 0, ?)
     ON CONFLICT(question_id) DO UPDATE SET bookmarked = ?`,
    questionId, newValue, newValue
  );
  return newValue === 1;
}
