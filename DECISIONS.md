# DECISIONS

## Heuristic and ranking
- Each event type gets an **importance weight** (`src/rank.ts`). Goals/penalties
  score highest (100), then red cards (90), penalty won (60), woodwork (55),
  big saves (45), yellow cards (30), clear misses (25), subs (20), blocks (15),
  offsides (8), corners (5), fouls (2). Structural events (kickoff, half/full
  time, lineup, added time) score 0 and never become pages — they're only used
  to derive the running score.
- Selection is **goals-first, then fill by weight**: every goal is guaranteed a
  page, then the remaining slots (cap of 10 highlights) are filled by descending
  weight, and the final set is re-sorted into chronological order. This
  guarantees the spine of the story (the four goals) while letting near-misses
  and drama compete for the rest.
- **Mirror-pair collapse**: a single foul emits both `free kick won` and
  `free kick lost`, and a penalty emits `penalty won` + `penalty lost`, at the
  same timestamp. These are collapsed to one event (keeping the higher-weighted,
  more positive side) so one incident can't occupy two consecutive slides.
- **Same-minute save deduplication**: multiple `attempt saved` events at the
  same minute are deduplicated to the first by match order. They typically
  represent one chaotic sequence (rebound, follow-up shot) rather than two
  distinct story moments, so surfacing both produces nearly identical slides.

## Data handling (duplicates, missing fields, out-of-order minutes)
- **Envelope**: events live at `messages[0].message`, not at the top level. The
  loader is defensive about three shapes (`{messages:[{message}]}`,
  `[{message}]`, `{message}`) so it won't silently produce an empty story.
- **Strings → numbers**: `minute`/`period`/`second` arrive as strings and are
  parsed to integers; minute is clamped to 0–130 to satisfy the schema.
- **Out-of-order**: the feed is newest-first. Every event gets a monotonic
  `order` key (`period·1e6 + minute·60 + second`) and is sorted ascending, so
  added-time minutes (e.g. 92') in the 2nd half order correctly.
- **Duplicates**: de-duplicated by event `id` on load.
- **Missing fields**: player/team refs that don't resolve fall back gracefully
  ("A player" / empty team) rather than throwing.
- **Player names** are built "First Last", except where the feed uses a
  surname-first convention (matchName "Yang Hyun-Jun" while firstName is
  "Hyun-Jun") — detected from matchName and honoured, so we don't print
  "Hyun-Jun Yang".
- **Match identity**: `story_id` and `created_at` are derived from the feed's
  `matchInfo` (date + description) rather than the build moment, so the story is
  identified by the match it describes, not when the tool happened to run.
- **Running score**: parsed directly from the authoritative scoreline text in
  comments ("Celtic 2, Kilmarnock 0") rather than incrementing a counter, so it
  self-corrects against the feed's own truth. Home/away is also derived from the
  order names appear in that scoreline (Celtic is written first → home).

## Pack structure and invariants
- Output is `cover → highlights (chronological) → info` (`out/story.json`).
- **Schema fix**: the shipped `schema/story.schema.json` is unusable — it
  `require`s `pack_id` but only defines `story_id` under `properties`, while
  `additionalProperties:false` rejects anything else. Any document is therefore
  invalid. I added `schema/story.fixed.schema.json` as a corrected reference, and
  the equivalent rules are encoded as a Zod schema in `src/validate.ts` (which is
  what the builder validates against).
- Validation enforces extra invariants the schema can't: first page is a cover,
  and highlight pages are non-decreasing in minute.
- Output is **deterministic** given a fixed `created_at` (covered by a test).

## Reuse across matches (how dynamic it is)
- The tool is **data-driven across matches from the same feed provider** — no
  code changes are needed to run a different game. Teams/players come from
  auto-discovered `*-squad.json` files (filenames aren't hardcoded; names are
  read from file content); home/away, title, score, and `story_id`/`created_at`
  all derive from the data. Verified by renaming the squad files and confirming
  the teams still resolve from their contents.
- It intentionally does **not** adapt to a different provider's event vocabulary
  (the `rank.ts` weights are keyed to this feed's type strings; unknown types
  fall through to a default), non-English commentary, or the `"Home H, Away A"`
  scoreline convention. Supporting another provider is an adapter layer.

## Persistence (and why there's none)
- The tool is intentionally **stateless**: JSON in, JSON out, fully recomputed
  each run — no database, ORM models, or migrations, because nothing needs to be
  stored or queried across runs. This also keeps it deterministic and easy to
  test. A DB only becomes relevant behind a CMS (authoring, editing, scheduling,
  versioning, or serving Stories via an API); at that point the `Story`/`Page`
  types are the natural schema basis.

## What I would do with 2 more hours
- **Calibrate shot ranking against industry practice.** Shots are currently
  weighted by type (miss/save/blocked/post). Opta ranks chances by Expected
  Goals (xG) and a "big chance" flag — penalties always qualify as big chances —
  and Apple's Key Plays surface "scoring plays and big moments." The feed here
  carries no xG field, so the principled extension is a big-chance *proxy*
  parsed from the commentary text ("very close range", "six-yard box" → high;
  "from outside the box", "high and wide" → low). Deferred deliberately: without
  a real xG signal to validate against, free-text string-matching is brittle and
  would trade an explainable weight table for keyword luck.
- Momentum/clustering: detect passages of sustained pressure (several
  shots/corners in a window) and summarise them as one "info" page instead of
  several thin slides.
- Per-type caps for variety (at most two "big save" slides) are implemented;
  same-minute save deduplication is also done. A tie-break that prefers spreading
  moments across both halves remains a future step.
- Optional AI caption polish behind a flag, with the eval harness in EVALS.md
  gating it, plus a real image-selection step (map each goal to the photo
  nearest its minute) rather than positional assignment.
- A small HTTP mode (`GET /story`) alongside the CLI, and snapshot tests on the
  generated story.
