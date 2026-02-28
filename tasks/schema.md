# Data Schema — KY Plumber Exam Prep

## Question Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | yes | Unique identifier (e.g., "ky-vent-001") |
| prompt | string | yes | The question text |
| type | enum | yes | `"mcq"` or `"fill_blank"` |
| choices | string[] | if mcq | Array of 4 answer options |
| answer | string | yes | The correct answer (must match a choice exactly for MCQ) |
| explanation | string | yes | Plain English explanation of why the answer is correct |
| foreman_explanation | string | no | Jobsite-language explanation |
| topic | string | yes | Must be from the topic taxonomy below |
| code_section | string | yes | Kentucky code section reference (e.g., "815KAR20:090") |
| source | string | yes | Where this question came from (see source rules below) |
| verified | boolean | yes | `true` only if matched to a specific KY code/law provision |
| difficulty | 1 \| 2 \| 3 | yes | 1=easy, 2=medium, 3=hard |
| tags | string[] | no | Additional tags for filtering |

## Code Section Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | yes | Unique identifier (e.g., "cs-090") |
| section | string | yes | Kentucky regulation reference (e.g., "815KAR20:090") |
| title | string | yes | Human-readable section title |
| short_summary | string | yes | 1-3 sentence plain English summary |
| keywords | string[] | yes | Key terms for search/linking |

## Allowed Question Types

| Type | Format | When to Use |
|------|--------|-------------|
| `mcq` | 4 choices, 1 correct | Standard multiple choice — primary format |
| `fill_blank` | Free text answer | Definitions, values, calculations — secondary format |

## Topic Taxonomy

These are the only allowed topic values. Each maps to KY code sections:

| Topic Slug | Display Name | Primary KY Code Section |
|------------|-------------|------------------------|
| `venting` | Venting Systems | 815KAR20:090 |
| `traps` | Traps & Trap Arms | 815KAR20:090 |
| `dfu` | Drainage Fixture Units | 815KAR20:080 |
| `sizing` | Pipe Sizing & Slope | 815KAR20:080 |
| `water_supply` | Water Supply & Distribution | 815KAR20:120 |
| `backflow` | Backflow Prevention | 815KAR20:120 |
| `water_heaters` | Water Heaters | 815KAR20:120 |
| `fixtures` | Plumbing Fixtures | 815KAR20:070, 815KAR20:191 |
| `cleanouts` | Cleanouts | 815KAR20:090 |
| `pipe_materials` | Pipe Materials & Joints | 815KAR20:090 |
| `sewers_storm` | Sewers & Storm Water | 815KAR20:130 |
| `inspections` | Inspections & Tests | 815KAR20:150 |
| `special_connections` | Special Connections | 815KAR20:180 |
| `law_licensing` | KY Plumbing Law & Licensing | KRS318, 815KAR2 |

## Verification Rules

### Verified (`verified: true`)
A question is verified ONLY if:
1. The correct answer can be traced to a specific Kentucky statute (KRS 318), Kentucky administrative regulation (815 KAR), or the Kentucky State Plumbing Code Book, AND
2. The code_section field references the specific KY provision, AND
3. The explanation cites the KY source

### Unverified (`verified: false`)
A question is unverified if:
- It comes from a non-Kentucky source (IPC, Alabama, other states, generic practice tests)
- It's based on general plumbing knowledge that MIGHT apply in KY but hasn't been confirmed against KY code
- It was AI-drafted and not yet reviewed against the KY code book

### Source Classification
Every question must have a `source` field. Allowed source values:

| Source | Classification | Allowed in Production? |
|--------|---------------|----------------------|
| `ky-code-book-2023` | Official | Yes |
| `krs-318` | Official | Yes |
| `815kar20` | Official | Yes |
| `ky-dhbc` | Official | Yes |
| `ipc-2018` | Secondary | Only if matched to KY code |
| `alabama-practice-2015` | Unverified | Draft only |
| `quizlet-ky` | Unverified | Draft only |
| `generic-practice` | Unverified | Draft only |
| `ai-drafted` | Unverified | Draft only |

### Production Rules
- Only `verified: true` questions appear in Drill and Mock Exam modes
- `verified: false` questions can appear in a separate "Practice Draft" mode with a visible "UNVERIFIED" label
- No question goes into production without a code_section reference
