# Kentucky Master Plumber Exam Prep App — Build Plan

## Research Summary

### KY Exam Facts
- **Code**: Kentucky State Plumbing Law, Regulations and Code Book (NOT IPC/UPC — KY has its own)
- **Format**: ~50 questions (multiple choice + fill-in-blank) + pipe sizing isometric drawing
- **Time**: 2.5 hours
- **Pass score**: 80% (journeyman = 75%)
- **Pass rate**: ~15%
- **Closed book** — no references during exam
- **Paper-based**, hand-graded, given 4x/year in Frankfort (Feb, May, Aug, Nov)
- **7 rotating test versions** of varying difficulty

### KY Code Sections (from 815 KAR Chapter 20)
- 070 — Plumbing Fixtures
- 080 — Waste Pipe Size
- 090 — Soil, Waste, Vent Systems, Traps, and Clean-Outs
- 120 — Water Supply and Distribution
- 130 — House Sewers and Storm Water Piping
- 150 — Inspections and Tests
- 170 — Manufactured Home / Mobile Home Community Waste
- 180 — Special Connections
- 191 — Minimum Fixture Requirements
- 195 — Medical Gas Piping

### Key Exam Topics (from forum/community intel)
1. Venting (NO wet venting in KY — every fixture individually vented)
2. Vent sizing
3. DFU calculations and pipe sizing
4. Trap arm lengths
5. Pipe materials (allowed vs not for specific uses)
6. Cleanout distances
7. KRS Chapter 318 (plumbing law — license revocation, definitions)
8. Agency acronyms (ASTM, APML, ASSE)
9. Isometric drawing / pipe sizing (weighted heavily)
10. Terminology (PVC, ABS, DWV definitions)
11. Acid waste / dilution pits
12. Mobile home park plumbing
13. Sand/grease trap configurations

### Critical KY-Specific Detail
- **No wet venting** — Kentucky does NOT allow wet venting. Every fixture must be individually vented. This is different from IPC.
- Drawing portion: must size to **minimum** code requirements (oversizing penalized like undersizing)

---

## Phase 1 — MVP Build Plan

### Architecture
```
Expo + React Native + TypeScript
├── expo-router (navigation)
├── expo-sqlite (offline-first local DB)
├── NativeWind (Tailwind-like styling)
└── zustand (lightweight state management)
```

### Why this stack:
- **expo-sqlite**: True offline-first. Works in a truck with zero signal. No server needed.
- **expo-router**: File-based routing. Clean, simple.
- **NativeWind**: Fast styling without boilerplate. You know Tailwind-like patterns.
- **zustand**: Minimal state management. No Redux bloat.

### Data Model

```
questions
├── id (string, UUID)
├── prompt (string — the question text)
├── type ("multiple_choice" | "fill_in_blank")
├── choices (JSON array — for MC questions)
├── correct_answer (string)
├── explanation (string — plain English)
├── foreman_explanation (string — "explain it like a foreman" jobsite language)
├── code_section (string — e.g., "090" or "KRS 318.010")
├── code_text (string — actual code excerpt)
├── topic (string — e.g., "venting", "traps", "dfu")
├── difficulty (1-3)
├── tags (JSON array)
├── reviewed_status ("draft" | "reviewed" | "approved" | "retired")
├── created_at (timestamp)

question_attempts
├── id (string)
├── question_id (FK)
├── selected_answer (string)
├── is_correct (boolean)
├── response_time_ms (integer)
├── session_id (FK)
├── attempted_at (timestamp)

study_sessions
├── id (string)
├── mode ("drill" | "missed" | "topic" | "mock_exam")
├── topic_filter (string, nullable)
├── question_count (integer)
├── correct_count (integer)
├── total_time_ms (integer)
├── started_at (timestamp)
├── completed_at (timestamp, nullable)

user_progress
├── question_id (FK, unique)
├── times_seen (integer)
├── times_correct (integer)
├── accuracy (float)
├── last_seen (timestamp)
├── next_review (timestamp — for spaced repetition)
├── confidence_level (1-5)
├── bookmarked (boolean)

code_sections
├── id (string)
├── section_number (string — e.g., "090")
├── title (string)
├── summary (string — plain English)
├── full_text (string — actual code text)
├── parent_section (string, nullable)
├── sort_order (integer)

bookmarks
├── id (string)
├── question_id (FK, nullable)
├── code_section_id (FK, nullable)
├── note (string, nullable)
├── created_at (timestamp)
```

### Screens (6 total for MVP)

1. **Home** (`/`)
   - Daily streak counter
   - "Start Drill" one-tap button (primary CTA)
   - Quick stats: accuracy %, questions studied, weak areas
   - Navigation to other modes

2. **Drill Mode** (`/drill`)
   - 10-question burst
   - Question card with choices
   - Instant feedback on tap (correct/wrong + explanation)
   - "Explain Like a Foreman" toggle
   - Code reference link
   - Progress bar (1/10, 2/10...)
   - End screen: score, streak, weak topics, time

3. **Missed Mode** (`/missed`)
   - Only questions previously answered wrong
   - Same UI as drill but filtered
   - Questions repeat until mastered (2 correct in a row = mastered)

4. **Mock Exam** (`/mock`)
   - Choose: 25 / 50 question sets
   - Timed (proportional to real exam: 50 questions = 2.5 hours)
   - No explanations during — only at end
   - Score breakdown by category
   - Pass/fail indicator (80% threshold)

5. **Topics** (`/topics`)
   - Grid of topic cards with accuracy heat coloring
   - Green = strong (>80%), Yellow = okay (60-80%), Red = weak (<60%)
   - Tap topic → drill only that topic
   - Categories: Venting, Traps, DFUs, Water Supply, Pipe Materials,
     Cleanouts, Fixtures, Law/Licensing, Sizing, Sewers/Storm,
     Inspections/Tests, Special Connections

6. **Code Reference** (`/code`)
   - Searchable code sections
   - Plain English summary for each
   - Actual code text expandable
   - "Questions from this section" link
   - Bookmarkable sections

### Implementation Order

- [x] Research KY exam, IPC structure, practice questions
- [ ] Step 1: Initialize Expo project with TypeScript, NativeWind, expo-router
- [ ] Step 2: Set up SQLite database with schema and migrations
- [ ] Step 3: Build seed data — transform research into question JSON
- [ ] Step 4: Build Home screen with navigation
- [ ] Step 5: Build Drill Mode (core loop — most important screen)
- [ ] Step 6: Build Missed Mode
- [ ] Step 7: Build Mock Exam Mode
- [ ] Step 8: Build Topics screen (weak area dashboard)
- [ ] Step 9: Build Code Reference screen
- [ ] Step 10: Test full flow, verify offline works, push to branch

### Rollback Path
- Git branch: `claude/general-session-jCAfN`
- Each major step gets its own commit
- If anything breaks: `git revert` to last good commit

### Success Criteria
- App launches on iOS via Expo Go
- Can complete a 10-question drill with instant feedback
- Wrong answers appear in Missed Mode
- Mock exam times and scores correctly
- Topic dashboard shows accuracy heat map
- Code sections searchable and linked to questions
- Works fully offline (airplane mode test)
- 200+ seed questions across all major topics
