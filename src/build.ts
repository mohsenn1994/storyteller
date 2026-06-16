/**
 * Stage 4 of the pipeline: BUILD.
 *
 * Assembles the final Story object: a cover page, the ranked highlight pages
 * (with generated copy and images), and a closing info page. Also identifies the
 * Story by the match it describes (date + teams from matchInfo), not by when the
 * build happened to run.
 *
 * Pipeline: load -> score -> rank -> [build] -> validate
 */
import { readdirSync } from 'node:fs';
import { copyFor } from './captions.js';
import type { LoadedData } from './load.js';
import { selectHighlights, type RankOptions } from './rank.js';
import { annotateScores, finalScore } from './score.js';
import type { HighlightPage, Page, Story } from './types.js';

export interface BuildOptions extends RankOptions {
  assetsDir: string;
  /** stable timestamp so output is reproducible in tests */
  now?: Date;
}

/** List the usable photos in assets/ (jpg/png, excluding the placeholder). */
function listAssets(assetsDir: string): string[] {
  try {
    return readdirSync(assetsDir)
      .filter((f) => /\.(jpe?g|png)$/i.test(f) && !/placeholder/i.test(f))
      .sort();
  } catch {
    return [];
  }
}

/** "Celtic vs Kilmarnock" -> "celtic-vs-kilmarnock" for a readable story_id. */
function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildStory(data: LoadedData, opts: BuildOptions): Story {
  const { events, homeTeam, awayTeam, info } = data;
  const scores = annotateScores(events, homeTeam, awayTeam);
  const final = finalScore(events, homeTeam, awayTeam);
  const assets = listAssets(opts.assetsDir);
  const asset = (i: number): string | undefined =>
    assets.length ? `assets/${assets[i % assets.length]}` : undefined;

  const highlights = selectHighlights(events, { maxHighlights: opts.maxHighlights });

  const cover: Page = {
    type: 'cover',
    headline: `${homeTeam.name} ${final.home}–${final.away} ${awayTeam.name}`,
    subheadline: `Full-time report · ${highlights.length} key moments`,
    image: asset(0) ?? 'assets/placeholder.png',
  };

  const highlightPages: HighlightPage[] = highlights.map((e, i) => {
    const copy = copyFor(e, scores.get(e.id)!, homeTeam, awayTeam);
    return {
      type: 'highlight',
      minute: e.minute,
      headline: copy.headline,
      caption: copy.caption,
      explanation: copy.explanation,
      image: asset(i + 1),
    };
  });

  const goals = highlights.filter(
    (e) => e.type === 'goal' || e.type === 'penalty goal',
  );
  const scorers = goals
    .map((g) => `${g.minute}' ${g.player ?? 'Unknown'}`)
    .join(' · ');

  const outro: Page = {
    type: 'info',
    headline: 'How this Story was built',
    body:
      `Final score ${homeTeam.name} ${final.home}–${final.away} ${awayTeam.name}. ` +
      `Goals: ${scorers || 'none'}. ` +
      `${highlights.length} moments selected from ${events.length} raw events by importance ranking.`,
  };

  const pages: Page[] = [cover, ...highlightPages, outro];

  // Identify the story by the match, not the moment it was built.
  const matchDate = info.date ?? (opts.now ?? new Date()).toISOString().slice(0, 10);
  const slugBase = info.description
    ? slug(info.description)
    : slug(`${homeTeam.name} vs ${awayTeam.name}`);
  const createdAt = info.date
    ? new Date(`${info.date}T00:00:00Z`).toISOString()
    : (opts.now ?? new Date()).toISOString();

  return {
    story_id: `${slugBase}-${matchDate}`,
    title: `${homeTeam.name} ${final.home}–${final.away} ${awayTeam.name}`,
    source: 'data/match_events.json',
    created_at: createdAt,
    metrics: {
      raw_events: events.length,
      highlights: highlights.length,
      goals: goals.length,
      final_score: { home: final.home, away: final.away },
    },
    pages,
  };
}
