/**
 * Stage 2 of the pipeline: SCORE.
 *
 * Derives the running scoreline at every moment in the match. Rather than
 * incrementing a counter on goal events (fragile), it reads the authoritative
 * "Home H, Away A" score that the feed already writes into goal and
 * period-boundary comments, and carries the last known value forward.
 *
 * Pipeline: load -> [score] -> rank -> build -> validate
 */
import type { MatchEvent, Score, Team } from './types.js';

/**
 * Parse the running score out of an event comment. Scorelines are written
 * "Home H, Away A" inside goal and period-boundary comments, e.g.
 * "Goal! Celtic 4, Kilmarnock 0." This is more reliable than incrementing
 * counters, because it self-corrects against the feed's own truth.
 */
export function parseScore(
  comment: string,
  home: Team,
  away: Team,
): Score | null {
  const h = new RegExp(`${escape(home.name)}\\s+(\\d+)`).exec(comment);
  const a = new RegExp(`${escape(away.name)}\\s+(\\d+)`).exec(comment);
  if (!h || !a) return null;
  return { home: Number(h[1]), away: Number(a[1]) };
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Attach the running score to every event by carrying the last known one forward. */
export function annotateScores(
  events: MatchEvent[],
  home: Team,
  away: Team,
): Map<string, Score> {
  const scores = new Map<string, Score>();
  let current: Score = { home: 0, away: 0 };
  for (const e of events) {
    const parsed = parseScore(e.comment, home, away);
    if (parsed) current = parsed;
    scores.set(e.id, { ...current });
  }
  return scores;
}

export function finalScore(events: MatchEvent[], home: Team, away: Team): Score {
  let last: Score = { home: 0, away: 0 };
  for (const e of events) {
    const parsed = parseScore(e.comment, home, away);
    if (parsed) last = parsed;
  }
  return last;
}
