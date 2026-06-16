# EVALS

Captions in this build are **rule-based, not AI-generated**, so they can be
checked with deterministic assertions rather than subjective grading. The
quality bar for a highlight caption is that it names the **minute context**, the
**player**, the **team**, and the **resulting score** where applicable.

## Automated checks (in `tests/build.test.ts`)
- Every goal event produces a page (no scorer dropped).
- Highlight pages are non-decreasing in minute.
- The story validates against the schema and the cover-first invariant.

## Caption quality rubric (manual, if an AI caption pass is added later)
For each highlight, score 0/1 on: contains player name · contains team ·
contains/implies the scoreline · ≤ 160 chars · no invented detail. Target ≥ 4/5.

## Examples (current rule-based output)
1. Goal — `GOAL — Johnny Kenny` / "Johnny Kenny scores for Celtic. Celtic 1–0
   Kilmarnock." (player ✓, team ✓, score ✓)
2. Woodwork — `OFF THE WOODWORK` / "Bruce Anderson (Kilmarnock) strikes the post.
   Inches from a goal. Celtic 1–0 Kilmarnock." (player ✓, team ✓, score ✓)
3. Penalty goal — `GOAL — Arne Engels (pen)` / "Arne Engels scores from the
   penalty spot for Celtic. Celtic 4–0 Kilmarnock." (player ✓, team ✓, score ✓)
