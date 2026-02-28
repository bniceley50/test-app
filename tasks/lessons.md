# Lessons Learned

## Active Lessons

### 1. [content] Content before code
- **Pattern**: Started building app screens and UI before verifying the question bank and code reference data existed and was accurate.
- **Rule**: For content-driven apps, the data layer IS the product. Prove seed data is real and verified before writing any UI. No question enters production without a source reference.
- **Date**: 2026-02-28

### 2. [content] Don't mix unverified sources into production
- **Pattern**: Mixed Alabama, IPC, Quizlet, Reddit, and generic plumbing practice content with Kentucky-specific material. This poisons the database.
- **Rule**: Non-Kentucky sources are draft inspiration ONLY. They cannot be labeled as verified Kentucky study material unless explicitly matched to a Kentucky code section.
- **Date**: 2026-02-28

### 3. [infra] Don't push commits before the core asset exists
- **Pattern**: Committed and pushed project scaffolding before the most important asset (validated question bank) was proven to work.
- **Rule**: The first meaningful commit should include the core data schema + minimum viable seed data, not empty scaffolding.
- **Date**: 2026-02-28

## Format
Each lesson should include:
- **Category tag**: [auth], [db], [testing], [ui], [infra], [content], [expo], [navigation]
- **Pattern**: What happened
- **Rule**: What to do instead
- **Date**: When learned
