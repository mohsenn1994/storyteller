/**
 * Stage 1 of the pipeline: LOAD.
 *
 * Reads the raw match feed and squad files and turns them into a clean,
 * chronologically ordered list of `MatchEvent`s plus team/player/match metadata.
 * Everything downstream (score, rank, build) consumes this normalised shape, so
 * all the messy feed-specific handling (string numbers, reverse ordering,
 * opaque ID refs, the `messages[0].message` envelope) is contained here.
 *
 * Pipeline: [load] -> score -> rank -> build -> validate
 */
import { readdirSync, readFileSync } from 'node:fs';
import type { MatchEvent, Player, RawEvent, Team } from './types.js';

interface SquadFile {
  squad: Array<{
    contestantId: string;
    contestantName: string;
    contestantShortName: string;
    contestantCode: string;
    person: Array<{
      id: string;
      firstName: string;
      lastName: string;
      matchName: string;
    }>;
  }>;
}

interface RawFile {
  matchInfo?: {
    date?: string;
    localDate?: string;
    description?: string;
    [k: string]: unknown;
  };
  messages?: Array<{ language: string; message: RawEvent[] }>;
}

/** Match-level metadata pulled from the feed's matchInfo block. */
export interface MatchInfo {
  /** ISO date of the match (YYYY-MM-DD), best-effort from the feed. */
  date?: string;
  /** e.g. "Celtic vs Kilmarnock" */
  description?: string;
}

export interface LoadedData {
  events: MatchEvent[];
  teams: Map<string, Team>;
  players: Map<string, Player>;
  /** The two teams, resolved as home (listed first at kickoff) and away. */
  homeTeam: Team;
  awayTeam: Team;
  info: MatchInfo;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

/**
 * Build a display name. Most players read "First Last", but some feeds use a
 * surname-first convention (e.g. matchName "Yang Hyun-Jun" while firstName is
 * "Hyun-Jun"). Detect that case from matchName and honour it, so we don't print
 * "Hyun-Jun Yang". Falls back to "First Last", then to matchName.
 */
function displayName(firstName: string, lastName: string, matchName: string): string {
  const fn = (firstName ?? '').trim();
  const ln = (lastName ?? '').trim();
  const mn = (matchName ?? '').trim();
  if (fn && ln && mn) {
    const lower = mn.toLowerCase();
    if (lower.startsWith(ln.toLowerCase()) && lower.includes(fn.toLowerCase())) {
      return `${ln} ${fn}`; // surname-first, e.g. "Yang Hyun-Jun"
    }
  }
  return [fn, ln].filter(Boolean).join(' ') || mn;
}

function teamFromSquad(file: SquadFile): { team: Team; players: Player[] } {
  const c = file.squad[0];
  const team: Team = {
    id: c.contestantId,
    name: c.contestantShortName,
    fullName: c.contestantName,
    code: c.contestantCode,
  };
  const players = c.person.map((p) => ({
    id: p.id,
    name: displayName(p.firstName, p.lastName, p.matchName),
    teamId: team.id,
  }));
  return { team, players };
}

/**
 * The source clock is a display string ("90'+3'"). For ordering we need a
 * single monotonic key. period*10000 + minute*60 + second keeps halves in
 * order even when added-time minutes (e.g. 92) overlap with second-half
 * regulation minutes, and copes with out-of-order input.
 */
function orderKey(period: number, minute: number, second: number): number {
  // Map the various "end"/structural periods sensibly. Real play is 1 and 2.
  const periodRank = period >= 2 ? 2 : 1;
  return periodRank * 1_000_000 + minute * 60 + second;
}

export function load(dataDir: string): LoadedData {
  const raw = readJson<RawFile>(`${dataDir}/match_events.json`);
  // The feed wraps events as { matchInfo, messages: [{ language, message: [] }] }.
  // Stay defensive about older shapes ([{message}] or {message}).
  const rawEvents: RawEvent[] =
    raw?.messages?.[0]?.message ??
    (Array.isArray(raw) ? raw[0]?.message : undefined) ??
    (raw as { message?: RawEvent[] })?.message ??
    [];

  // Discover every "*-squad.json" in the data dir rather than hardcoding two
  // teams, so the tool works for any match from this feed without code changes.
  const squadFiles = readdirSync(dataDir)
    .filter((f) => f.endsWith('-squad.json'))
    .sort();
  if (squadFiles.length === 0) {
    throw new Error(`No "*-squad.json" files found in ${dataDir}`);
  }
  const squads = squadFiles.map((f) => teamFromSquad(readJson<SquadFile>(`${dataDir}/${f}`)));

  const teams = new Map<string, Team>();
  const players = new Map<string, Player>();
  for (const s of squads) {
    teams.set(s.team.id, s.team);
    for (const p of s.players) players.set(p.id, p);
  }

  const seen = new Set<string>();
  const events: MatchEvent[] = [];
  for (const r of rawEvents) {
    if (seen.has(r.id)) continue; // de-duplicate by event id
    seen.add(r.id);

    const minuteNum = Number.parseInt(r.minute ?? '0', 10) || 0;
    const period = Number.parseInt(r.period ?? '1', 10) || 1;
    const second = Number.parseInt(r.second ?? '0', 10) || 0;

    events.push({
      id: r.id,
      type: r.type,
      minute: Math.max(0, Math.min(130, minuteNum)), // schema bounds
      period,
      second,
      clock: r.time && r.time.trim() ? r.time.trim() : `${minuteNum}'`,
      comment: r.comment,
      team: r.teamRef1 ? teams.get(r.teamRef1) : undefined,
      player: r.playerRef1 ? players.get(r.playerRef1)?.name : undefined,
      player2: r.playerRef2 ? players.get(r.playerRef2)?.name : undefined,
      order: orderKey(period, minuteNum, second),
    });
  }

  // Source arrives newest-first; sort to true chronological order.
  events.sort((a, b) => a.order - b.order);

  // Home/away: the score in comments is always written "Home X, Away Y"
  // (e.g. "Goal! Celtic 4, Kilmarnock 0."). That ordering is authoritative,
  // so derive home from the first team name that appears in a scoreline.
  const teamList = [...teams.values()];
  const scoreline = events.find((e) => /\b\d+,\s+.+\b\d+/.test(e.comment));
  let homeTeam = teamList[0];
  if (scoreline) {
    const positions = teamList
      .map((t) => ({ t, i: scoreline.comment.indexOf(t.name) }))
      .filter((x) => x.i >= 0)
      .sort((a, b) => a.i - b.i);
    if (positions.length) homeTeam = positions[0].t;
  }
  const awayTeam = teamList.find((t) => t.id !== homeTeam.id) ?? homeTeam;

  const info: MatchInfo = {
    // matchInfo.date arrives as "2025-11-09Z"; keep just the date part.
    date: (raw?.matchInfo?.localDate ?? raw?.matchInfo?.date)?.slice(0, 10),
    description: raw?.matchInfo?.description,
  };

  return { events, teams, players, homeTeam, awayTeam, info };
}
