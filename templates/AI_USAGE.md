# AI USAGE

## Where AI helped
- I used an AI assistant (Claude) as a pair-programmer to build the solution, while I drove the direction, made the design decisions, and reviewed everything it produced.
- It produced the implementation I specified: the `src/` pipeline (`load -> score -> rank -> build -> validate`), the `preview/` story viewer, the Vitest suite, and first drafts of the docs — all of which I read, ran, and adjusted.
- The staged-pipeline architecture (each stage a pure, separately testable module, with all feed-specific mess contained in `load`) was a shared decision that I set the shape of.
- The ranking heuristic in `src/rank.ts` — the weight table, goals-first selection, the per-type variety cap, and mirror-pair collapsing — reflects my own editorial calls; the assistant wrote them up.

## Prompts or strategies that worked
- **Inspecting the real data before writing any code.** This surfaced things a from-memory implementation would have missed: events are nested at `messages[0].message` (not the top level), arrive newest-first, and store `minute`/`period`/`second` as strings. It also led to spotting the schema bug.
- **Iterating against real output** rather than trusting code blind — having it build, run, and render the viewer, then critiquing the result. Several fixes came out of that loop (story identity using build time instead of match date; "Hyun-Jun Yang" name order; three near-identical "big save" slides; hardcoded squad filenames).
- **Pushing back on scope** — declining anything that felt like over-engineering for a deliberately simple task (e.g. an xG-proxy caption parser), and documenting it as a future step instead.

## Verification steps (tests, assertions, manual checks)
- `npm test` — Ran 16 Vitest cases: loading/envelope parsing, chronological ordering, score parsing, ranking invariants (every goal kept, per-type cap respected), schema validation, cover-first and chronological-order invariants, match-based identity, and build determinism.
- `npm run typecheck` — strict TypeScript, no `any`.
- Manual: opened `preview/index.html` and stepped through the Story; spot-checked `out/story.json` against the match facts (4-0, the scorers and minutes).
- I independently confirmed the **schema bug**: the shipped `schema/story.schema.json` requires `pack_id` but only defines `story_id` with `additionalProperties: false`, so no document can validate. I added a corrected `schema/story.fixed.schema.json` and validate against it, keeping the original for contrast.

## Cases where you chose **not** to use AI and why
- **Captions are rule-based, not LLM-generated** — assembled from structured fields (player, team, running score) so the copy is reproducible, unit-testable, and free of hallucinated facts. An LLM caption pass would be a nice-to-have behind an eval gate, not the default.
- **The ranking weights, home/away derivation, and the schema-bug call** were my own judgement rather than AI suggestions accepted uncritically.
- **I researched how Opta (xG / "big chance") and Apple Sports (Key Plays) rank match moments, then chose not to build a commentary-parsing proxy for it** — with no xG signal in the feed, free-text matching would be brittle, so I documented it as a next step in `DECISIONS.md` instead of adding speculative code.
