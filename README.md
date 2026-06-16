# Highlights → Stories Mini-Builder

Ingests football match events and produces a **Story** (`out/story.json`, a JSON
bundle of Pages) plus a **preview viewer** to step through the slides.

Match in the sample data: **Celtic 4–0 Kilmarnock** (102 events → 10 ranked highlights).

## Demo

![Story viewer demo](docs/demo.gif)

The viewer plays like a 9:16 Story: segmented progress bars, auto-advance, tap/keyboard
navigation, and a broadcast scorebug showing the live score.

## Quick start
```bash
npm install
npm run build:story   # writes out/story.json + preview/story.data.js
npm test              # 16 invariant + unit tests
npm run typecheck
```

Then open `preview/index.html` in a browser (double-click works — no server
needed; story data is injected via the generated `preview/story.data.js`).

## How it works
A small, typed pipeline (`src/`):

| Stage | File | Responsibility |
|-------|------|----------------|
| load  | `load.ts` | unwrap the `messages[0].message` envelope, parse string→int, de-dup by id, sort chronologically, resolve team/player names from the squad files, derive home/away |
| score | `score.ts` | read the running scoreline straight from comment text |
| rank  | `rank.ts` | weight every event, guarantee all goals, fill remaining slots by importance, collapse foul/penalty mirror pairs, deduplicate same-minute saves |
| build | `build.ts` | assemble cover + highlights + info, generate deterministic captions, attach images |
| validate | `validate.ts` | Zod schema validation + extra invariants |

See **DECISIONS.md** for the ranking rationale, data-handling notes, how dynamic
the tool is across matches, and the no-database decision; **AI_USAGE.md** for
where AI was and wasn't used; and **EVALS.md** for caption quality checks.

> Note: the shipped `schema/story.schema.json` cannot validate any document (it
> requires `pack_id` but only defines `story_id`, with `additionalProperties:false`).
> A corrected `schema/story.fixed.schema.json` is used instead — details in DECISIONS.md.

## Layout
- `src/` — the builder (TypeScript, run with `tsx`).
- `data/` — raw match events + squad files.
- `assets/` — match photos used by the Story.
- `out/story.json` — generated Story.
- `preview/` — the Story viewer (`index.html` + generated `story.data.js`).
- `schema/` — output schema (shipped + corrected).
- `tests/` — Jest suite.
