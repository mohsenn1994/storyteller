# Highlights → Stories Mini‑Builder (Tech‑agnostic Scaffold)

**Goal:** Ingest sports match events and produce a **Story** (a JSON bundle of Pages) plus a **preview** to step through Pages.

You can implement the builder in any language as a **CLI** or **small HTTP service**. This scaffold includes:
- A **data contract** for events.
- A **JSON Schema** for the output story.
- Templates for `DECISIONS.md`, `AI_USAGE.md`, and test invariants.

Your goal is to produce the best possible Story based summary of the game and the best possible experience for viewing that Story.

How you achieve that is up to you. The below information serves to explain what you can see in this repository that you might wish to draw on as part of the above.

## Repository layout
- `data/` — The raw data which you have to work with `match_events.json` here (see `data/events_schema.md`).
- `assets/` — Images which you may wish to use in your Story JSON and Story Viewer.
- `out/` — The output JSON files which you produce. Add `.gitkeep` to keep the folder.
- `schema/pack.schema.json` — JSON Schema for validating the output pack.
- `preview/` — A place to put the Story viewer which you build.
- `tests/` - An empty tests folder which you might want to populate.
- `templates/DECISIONS.md`, `templates/AI_USAGE.md`, `templates/EVALS.md` — Template documents you can fill in.

Good luck, and have fun! Keep it simple and explain your thought process clearly.
