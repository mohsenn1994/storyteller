/**
 * Domain types for the match-events -> Story pipeline.
 *
 * Two layers matter here:
 *  - `RawEvent` mirrors the feed exactly (note: numbers arrive as strings, refs
 *    are opaque IDs). Only `load.ts` should touch this shape.
 *  - `MatchEvent` is the normalised internal shape every other stage uses.
 * The `Story`/`Page` types at the bottom are the output contract and match
 * `schema/story.fixed.schema.json`.
 */

/** A single raw event exactly as it appears in data/match_events.json. */
export interface RawEvent {
  id: string;
  comment: string;
  timestamp?: string;
  lastModified?: string;
  minute?: string; // NOTE: numbers arrive as strings in the source feed
  period?: string; // "1", "2", and odd markers like "14" (full time)
  second?: string;
  time?: string; // display clock e.g. "90'+3'"
  type: string;
  teamRef1?: string;
  teamRef2?: string;
  playerRef1?: string;
  playerRef2?: string;
}

/** A normalised event: numbers parsed, names resolved, ordered. */
export interface MatchEvent {
  id: string;
  type: string;
  minute: number; // clamped 0..130 to satisfy the schema
  period: number;
  second: number;
  clock: string; // human clock for display ("10'", "90'+3'")
  comment: string;
  team?: Team;
  player?: string;
  player2?: string;
  /** chronological sort key in seconds from kickoff */
  order: number;
}

export interface Team {
  id: string;
  name: string; // "Celtic"
  fullName: string; // "Celtic FC"
  code: string; // "CEL"
}

export interface Player {
  id: string;
  name: string; // matchName, e.g. "J. Kenny" -> we prefer full "Johnny Kenny"
  teamId: string;
}

/** Running score at the moment an event happened. */
export interface Score {
  home: number;
  away: number;
}

// ---- Story output (matches schema/story.fixed.schema.json) ----

export interface CoverPage {
  type: 'cover';
  headline: string;
  subheadline?: string;
  image: string;
}

export interface HighlightPage {
  type: 'highlight';
  minute: number;
  headline: string;
  caption: string;
  image?: string;
  explanation?: string;
}

export interface InfoPage {
  type: 'info';
  headline: string;
  body?: string;
}

export type Page = CoverPage | HighlightPage | InfoPage;

export interface Story {
  story_id: string;
  title: string;
  source: string;
  created_at: string;
  metrics?: Record<string, unknown>;
  pages: Page[];
}
