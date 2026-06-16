/**
 * Stage 4a of the pipeline: CAPTIONS.
 *
 * Turns a ranked event + its running score into display copy (headline,
 * caption, and the "why this made the cut" explanation). Deliberately rule-based
 * and deterministic: every fact comes from structured fields, so there is no
 * hallucinated detail and the output is reproducible and unit-testable.
 *
 * Pipeline: load -> score -> rank -> [build/captions] -> validate
 */
import { weightOf } from './rank.js';
import type { MatchEvent, Score, Team } from './types.js';

/**
 * Deterministic, rule-based headline + caption + explanation generation.
 * Intentionally NOT LLM-driven: every fact comes from structured fields, so
 * output is reproducible, testable, and free of hallucinated detail. The raw
 * feed comment is used as a fallback only.
 */

function scoreString(s: Score, home: Team, away: Team): string {
  return `${home.name} ${s.home}–${s.away} ${away.name}`;
}

function leaderPhrase(s: Score, scoringTeam: Team | undefined): string {
  if (!scoringTeam) return '';
  const margin = Math.abs(s.home - s.away);
  if (s.home === s.away) return 'Level again';
  return margin === 1 ? `${scoringTeam.name} edge ahead` : `${scoringTeam.name} pull clear`;
}

export interface Copy {
  headline: string;
  caption: string;
  explanation: string;
}

export function copyFor(
  e: MatchEvent,
  score: Score,
  home: Team,
  away: Team,
): Copy {
  const who = e.player ?? 'A player';
  const team = e.team?.name ?? '';
  const sc = scoreString(score, home, away);

  switch (e.type) {
    case 'goal':
    case 'penalty goal': {
      const pen = e.type === 'penalty goal' ? ' from the penalty spot' : '';
      const lead = leaderPhrase(score, e.team);
      return {
        headline: `GOAL — ${who}${pen ? ' (pen)' : ''}`,
        caption: `${who} scores${pen} for ${team}. ${sc}.`,
        explanation: `${lead || 'A goal'} — the decisive kind of moment a match Story is built around.`,
      };
    }
    case 'post':
      return {
        headline: 'OFF THE WOODWORK',
        caption: `${who} (${team}) strikes the post. Inches from a goal. ${sc}.`,
        explanation: 'Near-goals carry almost as much drama as goals — kept for tension.',
      };
    case 'attempt saved':
      return {
        headline: 'BIG SAVE',
        caption: `${who} (${team}) is denied by the keeper. ${sc}.`,
        explanation: 'A save that protected the scoreline is a genuine turning point.',
      };
    case 'penalty won':
      return {
        headline: 'PENALTY!',
        caption: `${who} wins a penalty for ${team}. ${sc}.`,
        explanation: 'A spot-kick award reshapes the game — high narrative value.',
      };
    case 'penalty lost':
      return {
        headline: 'PENALTY CONCEDED',
        caption: `${who} (${team}) gives away a penalty. ${sc}.`,
        explanation: 'The flip side of a penalty — a pivotal mistake.',
      };
    case 'yellow card':
      return {
        headline: 'BOOKED',
        caption: `${who} (${team}) goes into the referee's book. ${sc}.`,
        explanation: 'A caution that shifted the tempo or risked a player.',
      };
    case 'miss':
      return {
        headline: 'CHANCE GOES BEGGING',
        caption: `${who} (${team}) can't find the target. ${sc}.`,
        explanation: 'A clear opening that could have changed the score.',
      };
    case 'substitution':
      return {
        headline: 'CHANGE',
        caption: `${team}: ${e.player ?? 'a player'} on${e.player2 ? `, ${e.player2} off` : ''}. ${sc}.`,
        explanation: 'A substitution that altered the shape of the contest.',
      };
    case 'attempt blocked':
      return {
        headline: 'BLOCKED',
        caption: `${who}'s effort for ${team} is blocked. ${sc}.`,
        explanation: 'A goal-bound attempt stopped at the last moment.',
      };
    case 'offside':
      return {
        headline: 'FLAG UP',
        caption: `${who} (${team}) is caught offside. ${sc}.`,
        explanation: 'A chance ruled out — kept for narrative variety.',
      };
    case 'corner':
      return {
        headline: 'CORNER',
        caption: `Corner to ${team}. ${sc}.`,
        explanation: 'A set-piece threat in a passage of pressure.',
      };
    default:
      return {
        headline: e.type.toUpperCase(),
        caption: e.comment || `${who} (${team}). ${sc}.`,
        explanation: `Ranked in by weight ${weightOf(e)}.`,
      };
  }
}
