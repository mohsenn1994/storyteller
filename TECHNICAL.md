# Technical Documentation

A reference for reviewers: how the builder is structured, why it's built this
way, where the boundaries are, and how it would extend toward a real Storyteller
integration. For the quick-start and the ranking rationale see `README.md` and
`DECISIONS.md`; this document is the deeper engineering view.

## 1. What it does

The tool ingests a feed of football match events and produces two things:

1. **A Story** — `out/story.json`, a bundle of Pages (a cover, ranked highlight
   pages in chronological order, and a closing info page) that validates against
   a JSON Schema.
2. **A preview** — `preview/index.html`, a self-contained viewer that plays the
   Story like a real 9:16 Stories experience (segmented progress, auto-advance,
   tap/keyboard navigation, a broadcast scorebug).

The sample feed is Celtic 4–0 Kilmarnock: 102 events reduced to 10 highlights.

## 2. Architecture

The builder is a small, single-purpose pipeline. Each stage is a pure module
with one responsibility, which keeps the logic testable in isolation and makes
the data transformations easy to follow.

```
data/match_events.json ─┐
data/*-squad.json ───────┼─▶ load ─▶ score ─▶ rank ─▶ build ─▶ validate ─▶ out/story.json
assets/*.jpg ────────────┘                                              └─▶ preview/story.data.js
```

| Stage | File | Responsibility |
|-------|------|----------------|
| load | `src/load.ts` | Unwrap the `messages[0].message` envelope; cast string minutes/periods to integers; de-duplicate by event id; sort to true chronological order; auto-discover any `*-squad.json` files and resolve team/player names from them; derive home/away and match metadata. |
| score | `src/score.ts` | Read the running scoreline directly from the authoritative comment text and carry it forward across events. |
| rank | `src/rank.ts` | Assign an importance weight per event; guarantee every goal; fill remaining slots by weight; collapse foul/penalty mirror pairs; deduplicate same-minute saves; cap each non-goal type for variety. |
| build | `src/build.ts` | Assemble cover + highlights + info; generate deterministic captions; attach images; identify the Story by the match (not the build time). |
| validate | `src/validate.ts` | Zod schema validation plus invariants the schema can't express. |
| cli | `src/index.ts` | Wire the stages together, write outputs, and fail gracefully with a readable message. |

Types live in `src/types.ts`; the whole pipeline is strict TypeScript with no
`any`.

## 3. Data model

The output Story is intentionally close to the shape a real Stories platform
consumes: a typed bundle of Pages, each Page a small tagged union.

- **cover** — `headline`, optional `subheadline`, `image`.
- **highlight** — `minute`, `headline`, `caption`, optional `image` and
  `explanation` (the "why this made the cut" line).
- **info** — `headline`, optional `body`.

Plus top-level `story_id`, `title`, `source`, `created_at`, and a `metrics`
block (raw event count, highlight count, goals, final score) for observability.

### Schema note

The shipped `schema/story.schema.json` cannot validate any document: it
`require`s `pack_id`, only defines `story_id` under `properties`, and sets
`additionalProperties: false` — so every document is rejected either for a
missing required key or an unknown one. Validation now uses a Zod schema in
`src/validate.ts` (equivalent rules encoded in TypeScript) rather than the JSON
Schema file directly. The corrected `schema/story.fixed.schema.json` is kept as
a reference. The original is kept in the repo so the discrepancy is visible.

## 3a. Reuse across matches (how dynamic it is)

The tool is **data-driven across matches from the same feed provider** — no code
changes are needed to run a different game:

- **Teams and players** come from auto-discovered `*-squad.json` files (the
  filenames are not hardcoded; names are read from file content).
- **Home/away, title, final score, running scoreline** are parsed from the
  event comments.
- **`story_id` and `created_at`** come from `matchInfo` (description + date).
- **Highlight selection, captions, and the whole Story** follow from the data.

Verified by renaming the squad files to arbitrary names and confirming the teams
still resolve correctly from their contents.

What it intentionally does **not** adapt to (these are the boundaries, not bugs):

- **A different provider's event vocabulary.** Weights in `rank.ts` are keyed to
  this feed's type strings (`goal`, `attempt saved`, `penalty won`, …); unknown
  types fall through to a default weight. Supporting another provider is an
  adapter layer (see Future improvements).
- **Non-English commentary** and the `"Home H, Away A"` scoreline convention,
  which score parsing and captions assume.
- **Semantic image matching** — photos are assigned by slot order, not matched
  to the moment.

## 4. Ranking and captions

Ranking is a transparent, type-based weight table (goals 100 → fouls 2), tuned
for narrative value rather than frequency. Selection is goals-first, then
fill-by-weight, then re-sorted chronologically, with three refinements: mirror
pairs from a single incident (foul won/lost, penalty won/lost) are collapsed;
multiple saves at the same minute are deduplicated to one (they're usually one
chaotic sequence, not two distinct story moments); and each non-goal type is
capped (default 2) so the story stays varied. Full rationale and the industry
comparison (Opta xG / "big chance", Apple Sports Key Plays) are in `DECISIONS.md`.

Captions are **deterministic and rule-based**, assembled from structured fields
(player, team, running score) rather than generated by an LLM. This guarantees
no hallucinated facts, reproducible output, and unit-testable copy — see
`EVALS.md` for the quality rubric.

## 5. The viewer

`preview/index.html` is a single dependency-free file. The builder also emits
`preview/story.data.js`, which assigns the Story to `window.STORY`, so the
viewer opens by double-click without a local server (a plain `fetch` of a
`file://` JSON would be blocked by CORS). The viewer mirrors core Stories UX:
9:16 frame, segmented progress bars that fill on a timer, tap zones and arrow
keys, spacebar to pause, and a broadcast scorebug that reads the live score from
each page. Reduced-motion is respected.

## 6. Testing and validation

`npm test` runs 16 Jest cases covering: envelope parsing, chronological
ordering, name resolution (including surname-first names), match-metadata
extraction, score parsing, ranking invariants (all goals kept, cap respected,
per-type variety), schema validation, cover-first and chronological-order
invariants, match-based identity, and build determinism. `npm run typecheck`
enforces strict types. Output is deterministic given the same input.

## 7. Limitations (current scope)

These are conscious boundaries for a time-boxed take-home, not oversights:

- **No video.** Storyteller Stories are image *and* video; this builder only
  references the still images provided. Pages have no duration, transition, or
  media-type field yet.
- **Type-based shot weighting.** All shots of a given type share one weight. The
  feed carries no Expected Goals (xG) value, so chance quality (a point-blank
  miss vs a speculative 30-yarder) isn't distinguished.
- **Positional image selection.** Images are assigned by slot order, not matched
  to the moment (e.g. a goal photo to its scorer/minute).
- **One feed provider's vocabulary.** The loader auto-discovers squad files and
  is defensive about a few envelope shapes, but the ranking weights and comment
  parsing are built around this provider's event vocabulary and English text.
- **English-only, rule-based copy.** Captions assume English commentary and a
  "Home H, Away A" scoreline convention.
- **Heuristic name ordering.** Surname-first names are detected from `matchName`;
  an unusual feed could still mis-order a name.
- **No persistence.** This is a stateless file-in / file-out tool by design —
  no database, models, or migrations (see "Persistence" below).

## 8. Future improvements

Framed toward what a real Storyteller integration would need:

**Product / content**
- **Video and timing per Page.** Add `media` (image|video), `duration_ms`, and
  transition fields so the Story maps onto Storyteller's 9:16 video Pages, not
  just stills. Pick the goal clip for each scoring Page.
- **Engagement units.** Generate poll/quiz Pages from the data — "Who was your
  Man of the Match?", "Predict the final score" — matching Storyteller's
  interactive units, which is where engagement and shareability come from.
- **Ad slots.** Insert a native-ad Page at a configurable cadence (e.g. after
  the cover, mid-story) to mirror Storyteller's ad support without disrupting
  flow.
- **Richer narrative.** Cluster passages of pressure into one summary Page
  instead of several thin slides; add half-time and full-time info Pages with
  shots/possession.

**Ranking quality**
- **Calibrate to xG / "big chance"** when the feed provides it (Opta does),
  replacing flat per-type shot weights; until then, a documented big-chance
  proxy parsed from commentary is the next step (see `DECISIONS.md`).
- **Configurable editorial profiles** — a "goals only" cut vs a "full drama"
  cut — driven by the existing `maxHighlights` / `perTypeCap` / weight knobs.

**Engineering / platform**
- **Multi-sport, multi-feed.** Abstract the event vocabulary behind an adapter
  so other sports and providers plug in.
- **Service mode.** Expose `POST /stories` alongside the CLI for the CMS to call.
- **Analytics hooks.** Emit per-Page identifiers so the Story integrates with
  Storyteller's analytics (views, completion, dwell) out of the box.
- **Localization.** Move caption phrasing into a string layer keyed by locale,
  given Storyteller's global footprint.
- **Asset pipeline.** Validate image dimensions/aspect, generate 9:16 crops, and
  fail the build on missing media.

**Persistence (and why there's none today)**
- This tool is intentionally **stateless**: it reads JSON files and writes a JSON
  file. There is no database, no ORM models, and no migrations, because nothing
  in the task needs to be stored or queried across runs — the Story is fully
  derivable from the input on every run, which also keeps it deterministic and
  trivial to test.
- A database only becomes relevant when this moves behind Storyteller's CMS: if
  Stories were authored, edited, scheduled, versioned, or served via an API,
  you'd introduce persistence then (e.g. a `stories` table plus `pages`, with
  migrations). At that point the current `Story`/`Page` types are the natural
  basis for the schema. Until that requirement exists, adding a DB would be
  speculative complexity.

## 9. Running it

```bash
npm install
npm run build:story   # writes out/story.json + preview/story.data.js
npm test              # 16 tests
npm run typecheck
```

Then open `preview/index.html` in a browser. Requires Node 18+.
