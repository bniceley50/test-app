import * as SQLite from 'expo-sqlite';
import { Question, QuestionAttempt, StudySession, CodeSection, TopicStats } from './types';
import { uid } from './uid';

let db: SQLite.SQLiteDatabase;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('plumber_prep_v3.db');
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
      type TEXT NOT NULL DEFAULT 'mcq',
      choices TEXT NOT NULL DEFAULT '[]',
      answer TEXT NOT NULL,
      explanation TEXT NOT NULL DEFAULT '',
      foreman_explanation TEXT NOT NULL DEFAULT '',
      code_section TEXT NOT NULL DEFAULT '',
      topic TEXT NOT NULL DEFAULT '',
      difficulty INTEGER NOT NULL DEFAULT 2,
      tags TEXT NOT NULL DEFAULT '[]',
      source TEXT NOT NULL DEFAULT '',
      verified INTEGER NOT NULL DEFAULT 0
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
      missed_active INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (question_id) REFERENCES questions(id)
    );

    CREATE TABLE IF NOT EXISTS code_sections (
      id TEXT PRIMARY KEY,
      section TEXT NOT NULL,
      title TEXT NOT NULL,
      short_summary TEXT NOT NULL DEFAULT '',
      keywords TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS bookmarks (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      question_id TEXT NOT NULL DEFAULT '',
      code_section_id TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(kind, question_id, code_section_id)
      -- refs are NOT-NULL with '' for the unused column (SQLite uniques treat
      -- NULLs as distinct), so integrity is enforced app-side, not by FKs
    );

    CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions(topic);
    CREATE INDEX IF NOT EXISTS idx_attempts_question ON question_attempts(question_id);
    CREATE INDEX IF NOT EXISTS idx_attempts_session ON question_attempts(session_id);
    CREATE INDEX IF NOT EXISTS idx_progress_next_review ON user_progress(next_review);
    CREATE INDEX IF NOT EXISTS idx_bookmarks_kind ON bookmarks(kind);
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
      `INSERT OR IGNORE INTO questions (id, prompt, type, choices, answer, explanation, foreman_explanation, code_section, topic, difficulty, tags, source, verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      q.id, q.prompt, q.type, JSON.stringify(q.choices), q.answer,
      q.explanation, q.foreman_explanation || '', q.code_section,
      q.topic, q.difficulty, JSON.stringify(q.tags || []),
      q.source, q.verified ? 1 : 0
    );
  }
}

export async function seedCodeSections(sections: CodeSection[]): Promise<void> {
  const db = await getDatabase();
  const result = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM code_sections');
  if ((result?.count ?? 0) > 0) return;

  for (const s of sections) {
    await db.runAsync(
      `INSERT OR IGNORE INTO code_sections (id, section, title, short_summary, keywords)
       VALUES (?, ?, ?, ?, ?)`,
      s.id, s.section, s.title, s.short_summary, JSON.stringify(s.keywords || [])
    );
  }
}

export async function getDrillQuestions(count: number = 10): Promise<Question[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM questions WHERE verified = 1 ORDER BY RANDOM() LIMIT ?`, count
  );
  return rows.map(parseQuestionRow);
}

/**
 * Spaced-rep blended deck (locked decision: due items go to the TOP of every
 * deck, not a separate entry). Due = `next_review <= now`; ordered most
 * overdue first, then lowest confidence (times_correct, accuracy). Filled to
 * `count` with random verified questions excluding the due ones.
 */
export async function getDeckWithDue(count: number, topic: string | null = null): Promise<Question[]> {
  const db = await getDatabase();
  const topicClause = topic ? 'AND q.topic = ?' : '';
  const dueParams: (string | number)[] = topic ? [topic, count] : [count];
  const dueRows = await db.getAllAsync<any>(
    `SELECT q.* FROM questions q
     INNER JOIN user_progress p ON q.id = p.question_id
     WHERE q.verified = 1 ${topicClause} AND p.next_review <= datetime('now')
     ORDER BY p.next_review ASC, p.times_correct ASC, p.accuracy ASC
     LIMIT ?`,
    ...dueParams
  );
  const due = dueRows.map(parseQuestionRow);

  const restExcl = due.map(q => q.id);
  const notIn = restExcl.length ? `AND id NOT IN (${restExcl.map(() => '?').join(',')})` : '';
  const restParams: (string | number)[] = [
    ...restExcl,
    ...(topic ? [topic] : []),
    Math.max(0, count - due.length),
  ];
  const restRows = await db.getAllAsync<any>(
    `SELECT * FROM questions
     WHERE verified = 1 ${notIn} ${topic ? 'AND topic = ?' : ''}
     ORDER BY RANDOM() LIMIT ?`,
    ...restParams
  );
  return [...due, ...restRows.map(parseQuestionRow)];
}

export async function getTopicQuestions(topic: string, count: number = 10): Promise<Question[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM questions WHERE topic = ? AND verified = 1 ORDER BY RANDOM() LIMIT ?`, topic, count
  );
  return rows.map(parseQuestionRow);
}

export async function getActiveMissedQuestions(): Promise<Question[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT q.* FROM questions q
     INNER JOIN user_progress p ON q.id = p.question_id
     WHERE p.missed_active = 1
     ORDER BY p.last_seen ASC`
  );
  return rows.map(parseQuestionRow);
}

export async function getMockExamQuestions(count: number = 50): Promise<Question[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM questions WHERE verified = 1 ORDER BY RANDOM() LIMIT ?`, count
  );
  return rows.map(parseQuestionRow);
}

function parseQuestionRow(row: any): Question {
  return {
    id: row.id,
    prompt: row.prompt,
    type: row.type,
    choices: JSON.parse(row.choices || '[]'),
    answer: row.answer,
    explanation: row.explanation,
    foreman_explanation: row.foreman_explanation || '',
    code_section: row.code_section,
    topic: row.topic,
    difficulty: row.difficulty as 1 | 2 | 3,
    tags: JSON.parse(row.tags || '[]'),
    source: row.source,
    verified: row.verified === 1,
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

  // Update user_progress (missed_active = 1 on wrong answer, unchanged on correct)
  const isCorrectInt = attempt.is_correct ? 1 : 0;
  const missedOnInsert = attempt.is_correct ? 0 : 1;
  await db.runAsync(
    `INSERT INTO user_progress (question_id, times_seen, times_correct, accuracy, last_seen, next_review, confidence_level, bookmarked, missed_active)
     VALUES (?, 1, ?, ?, datetime('now'), datetime('now', '+1 day'), 0, 0, ?)
     ON CONFLICT(question_id) DO UPDATE SET
       times_seen = times_seen + 1,
       times_correct = times_correct + ?,
       accuracy = CAST((times_correct + ?) AS REAL) / (times_seen + 1),
       last_seen = datetime('now'),
       next_review = CASE
         WHEN ? = 1 THEN datetime('now', '+' || MIN(CAST(POWER(2, times_correct) AS INTEGER), 30) || ' days')
         ELSE datetime('now', '+1 day')
       END,
       missed_active = CASE WHEN ? = 0 THEN 1 ELSE missed_active END`,
    attempt.question_id,
    isCorrectInt,
    attempt.is_correct ? 1.0 : 0.0,
    missedOnInsert,
    isCorrectInt,
    isCorrectInt,
    isCorrectInt,
    isCorrectInt
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
    `SELECT COUNT(*) as count FROM user_progress WHERE missed_active = 1`
  );
  return result?.count ?? 0;
}

export async function clearMissedQuestion(questionId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE user_progress SET missed_active = 0 WHERE question_id = ?`,
    questionId
  );
}

// --- Code Section Queries ---

export async function getAllCodeSections(): Promise<CodeSection[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>('SELECT * FROM code_sections ORDER BY section');
  return rows.map(parseCodeSectionRow);
}

export async function searchCodeSections(query: string): Promise<CodeSection[]> {
  const db = await getDatabase();
  const pattern = `%${query}%`;
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM code_sections WHERE title LIKE ? OR short_summary LIKE ? OR keywords LIKE ? ORDER BY section`,
    pattern, pattern, pattern
  );
  return rows.map(parseCodeSectionRow);
}

function parseCodeSectionRow(row: any): CodeSection {
  return {
    id: row.id,
    section: row.section,
    title: row.title,
    short_summary: row.short_summary || '',
    keywords: JSON.parse(row.keywords || '[]'),
  };
}

export async function getQuestionsForCodeSection(sectionRef: string): Promise<Question[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM questions WHERE code_section = ?`, sectionRef
  );
  return rows.map(parseQuestionRow);
}

export async function getQuestionById(id: string): Promise<Question | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<any>('SELECT * FROM questions WHERE id = ?', id);
  return row ? parseQuestionRow(row) : null;
}

export async function getCodeSectionById(id: string): Promise<CodeSection | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<any>('SELECT * FROM code_sections WHERE id = ?', id);
  return row ? parseCodeSectionRow(row) : null;
}

// --- Bookmark Queries ---

export async function toggleBookmark(questionId: string): Promise<boolean> {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<{ bookmarked: number }>(
    'SELECT bookmarked FROM user_progress WHERE question_id = ?', questionId
  );
  const newValue = existing ? (existing.bookmarked ? 0 : 1) : 1;

  await db.runAsync(
    `INSERT INTO user_progress (question_id, times_seen, times_correct, accuracy, last_seen, next_review, confidence_level, bookmarked, missed_active)
     VALUES (?, 0, 0, 0, datetime('now'), datetime('now'), 0, ?, 0)
     ON CONFLICT(question_id) DO UPDATE SET bookmarked = ?`,
    questionId, newValue, newValue
  );
  return newValue === 1;
}

// --- New Bookmark Table (bookmarks: kind + ref + editable note) ---

export type BookmarkKind = 'question' | 'code_section';

export interface BookmarkRow {
  id: string;
  kind: BookmarkKind;
  question_id: string;
  code_section_id: string;
  note: string;
  created_at: string;
}

function bookmarkKey(kind: BookmarkKind, questionId: string, codeSectionId: string): string {
  return `${kind}:${kind === 'question' ? questionId : codeSectionId}`;
}

/**
 * Toggle a bookmark for a question or code section.
 * Returns true if the ref is now bookmarked.
 */
export async function toggleBookmarkRef(
  kind: BookmarkKind,
  questionId: string = '',
  codeSectionId: string = ''
): Promise<boolean> {
  const db = await getDatabase();
  const qid = kind === 'question' ? questionId : '';
  const cid = kind === 'code_section' ? codeSectionId : '';

  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM bookmarks WHERE kind = ? AND question_id = ? AND code_section_id = ?',
    kind, qid, cid
  );
  if (existing) {
    await db.runAsync('DELETE FROM bookmarks WHERE id = ?', existing.id);
    return false;
  }
  await db.runAsync(
    'INSERT INTO bookmarks (id, kind, question_id, code_section_id) VALUES (?, ?, ?, ?)',
    uid(), kind, qid, cid
  );
  return true;
}

/** Map of bookmarkKey -> row, for fast lookups in a screen. */
export async function getBookmarkMap(): Promise<Map<string, BookmarkRow>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<BookmarkRow>(
    'SELECT id, kind, question_id, code_section_id, note, created_at FROM bookmarks ORDER BY created_at DESC'
  );
  const map = new Map<string, BookmarkRow>();
  for (const r of rows) map.set(bookmarkKey(r.kind, r.question_id, r.code_section_id), r);
  return map;
}

/** All bookmarks, for the P3 Bookmarks screen (questions + sections, note included). */
export async function getBookmarks(): Promise<BookmarkRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<BookmarkRow>(
    'SELECT id, kind, question_id, code_section_id, note, created_at FROM bookmarks ORDER BY created_at DESC'
  );
}

/** Save an editable note on an existing bookmark (P3 Bookmarks screen). */
export async function setBookmarkNote(bookmarkId: string, note: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE bookmarks SET note = ? WHERE id = ?', note, bookmarkId);
}

/** Question counts per code_section, for the Code Reference screen (one query). */
export async function getQuestionCountsByCodeSection(): Promise<Map<string, number>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ code_section: string; n: number }>(
    `SELECT code_section, COUNT(*) as n
     FROM questions WHERE verified = 1 AND code_section != ''
     GROUP BY code_section`
  );
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.code_section, r.n);
  return map;
}
