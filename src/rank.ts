/**
 * Stage 3 of the pipeline: RANK.
 *
 * Decides which events become Story pages. Each event gets an importance weight;
 * selection is goals-first (every goal is guaranteed), then the best remaining
 * distinct moments fill up to a cap, with mirror-pair collapsing, same-minute
 * deduplication for saves, and a per-type cap to keep the story varied. The
 * result is returned in chronological order.
 *
 * This is the editorial heart of the tool — see DECISIONS.md for the rationale.
 *
 * Pipeline: load -> score -> [rank] -> build -> validate
 */
import type { MatchEvent } from './types.js';

/**
 * Importance weight per event type. Higher = more story-worthy.
 * Goals are guaranteed elsewhere; these weights decide who fills the
 * remaining highlight slots. Tuned for narrative value, not raw frequency.
 */
export const WEIGHTS: Record<string, number> = {
  goal: 100,
  'penalty goal': 100,
  'red card': 90,
  'penalty won': 60,
  'penalty lost': 58,
  post: 55, // hit the woodwork — high drama
  'attempt saved': 45, // a real save kept the score
  'yellow card': 30,
  miss: 25, // a clear chance that went begging
  substitution: 20,
  'attempt blocked': 15,
  offside: 8,
  corner: 5,
  'free kick won': 2,
  'free kick lost': 2,
};

// Structural / non-narrative events never become pages.
const STRUCTURAL = new Set([
  'start',
  'start delay',
  'end delay',
  'end 1',
  'end 2',
  'end 14',
  'lineup',
  'added time',
]);

export function weightOf(e: MatchEvent): number {
  if (STRUCTURAL.has(e.type)) return 0;
  return WEIGHTS[e.type] ?? 1;
}

export function isGoal(e: MatchEvent): boolean {
  return e.type === 'goal' || e.type === 'penalty goal';
}

/**
 * Some incidents emit two mirror events at the same instant from each side:
 * a foul ("free kick won" + "free kick lost") and a penalty ("penalty won" +
 * "penalty lost"). Collapse each mirror pair so one incident can't occupy two
 * slides. Keyed by minute+second; keep the higher-weighted (more positive) of
 * the pair.
 */
const MIRROR_TYPES = new Set([
  'free kick won',
  'free kick lost',
  'penalty won',
  'penalty lost',
]);

function collapseMirrorPairs(events: MatchEvent[]): MatchEvent[] {
  const byInstant = new Map<string, MatchEvent>();
  const passthrough: MatchEvent[] = [];
  for (const e of events) {
    if (MIRROR_TYPES.has(e.type)) {
      // Group fouls and penalties separately at the same instant.
      const kind = e.type.includes('penalty') ? 'pen' : 'foul';
      const key = `${kind}:${e.minute}:${e.second}`;
      const existing = byInstant.get(key);
      if (!existing || weightOf(e) > weightOf(existing)) byInstant.set(key, e);
    } else {
      passthrough.push(e);
    }
  }
  return [...passthrough, ...byInstant.values()];
}

// Multiple saves in the same minute are usually one chaotic sequence, not two
// distinct story moments. Keep only the first (by order) per minute.
const DEDUPE_BY_MINUTE = new Set(['attempt saved']);

function collapseByMinute(events: MatchEvent[]): MatchEvent[] {
  const seen = new Map<string, MatchEvent>();
  const passthrough: MatchEvent[] = [];
  for (const e of events) {
    if (DEDUPE_BY_MINUTE.has(e.type)) {
      const key = `${e.type}:${e.minute}`;
      const existing = seen.get(key);
      if (!existing || e.order < existing.order) seen.set(key, e);
    } else {
      passthrough.push(e);
    }
  }
  return [...passthrough, ...seen.values()];
}

export interface RankOptions {
  /** Maximum number of highlight pages (excludes cover + info). */
  maxHighlights: number;
  /**
   * Max pages of any single non-goal event type, to force variety
   * (e.g. avoid three "big save" slides in a row). Goals are never capped.
   * Defaults to 2.
   */
  perTypeCap?: number;
}

/**
 * Select the highlight events for the Story:
 *  1. every goal is guaranteed in,
 *  2. remaining slots fill by descending weight,
 *  3. result is returned in chronological order.
 */
export function selectHighlights(
  events: MatchEvent[],
  opts: RankOptions,
): MatchEvent[] {
  const candidates = collapseByMinute(collapseMirrorPairs(events)).filter((e) => weightOf(e) > 0);

  const goals = candidates.filter(isGoal);
  const rest = candidates
    .filter((e) => !isGoal(e))
    .sort((a, b) => weightOf(b) - weightOf(a) || a.order - b.order);

  const cap = opts.perTypeCap ?? 2;
  const typeCount = new Map<string, number>();

  const chosen = new Map<string, MatchEvent>();
  for (const g of goals) chosen.set(g.id, g);
  for (const e of rest) {
    if (chosen.size >= opts.maxHighlights) break;
    const seen = typeCount.get(e.type) ?? 0;
    if (seen >= cap) continue; // variety: cap each non-goal type
    typeCount.set(e.type, seen + 1);
    chosen.set(e.id, e);
  }

  return [...chosen.values()].sort((a, b) => a.order - b.order);
}
