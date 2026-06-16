# Story Schema

Use `story.schema.json` to validate your `out/story.json`. Any JSON Schema validator will work in your chosen language.
- Required fields: `story_id`, `title`, `pages`, `source`, `created_at`.
- Include at least one Page (cover Page is required by invariants).
- Pages can be of type `cover`, `highlight`, or `info`.

Tip: include a short `explanation` with highlight Pages if you implement ranking heuristics.
