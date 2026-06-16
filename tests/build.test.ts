import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';
import { buildStory } from '../src/build.js';
import { load } from '../src/load.js';
import { isGoal, selectHighlights, weightOf } from '../src/rank.js';
import { parseScore } from '../src/score.js';
import { validateStory } from '../src/validate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const data = load(resolve(root, 'data'));
const story = buildStory(data, {
  maxHighlights: 10,
  assetsDir: resolve(root, 'assets'),
  now: new Date('2025-11-09T18:00:00Z'),
});

describe('loading', () => {
  it('parses events out of the messages envelope', () => {
    expect(data.events.length).toBeGreaterThan(50);
  });

  it('orders events chronologically (kickoff first, full-time last)', () => {
    expect(data.events[0]?.type).toBe('start');
    for (let i = 1; i < data.events.length; i++) {
      expect(data.events[i].order).toBeGreaterThanOrEqual(data.events[i - 1].order);
    }
  });

  it('resolves player and team names', () => {
    const goal = data.events.find(isGoal);
    expect(goal?.player).toBeTruthy();
    expect(goal?.team?.name).toBeTruthy();
  });

  it('identifies Celtic as home from the scorelines', () => {
    expect(data.homeTeam.name).toBe('Celtic');
    expect(data.awayTeam.name).toBe('Kilmarnock');
  });

  it('exposes match metadata (date, description)', () => {
    expect(data.info.date).toBe('2025-11-09');
    expect(data.info.description).toBeTruthy();
  });

  it('honours surname-first names (e.g. Yang Hyun-Jun, not Hyun-Jun Yang)', () => {
    const names = [...data.players.values()].map((p) => p.name);
    expect(names).toContain('Yang Hyun-Jun');
    expect(names).not.toContain('Hyun-Jun Yang');
  });
});

describe('scoring', () => {
  it('reads a running scoreline from a goal comment', () => {
    const s = parseScore('Goal! Celtic 2, Kilmarnock 0.', data.homeTeam, data.awayTeam);
    expect(s).toEqual({ home: 2, away: 0 });
  });
});

describe('ranking', () => {
  it('weights goals above corners', () => {
    const goal = data.events.find(isGoal)!;
    const corner = data.events.find((e) => e.type === 'corner')!;
    expect(weightOf(goal)).toBeGreaterThan(weightOf(corner));
  });

  it('includes every goal in the highlights', () => {
    const highlights = selectHighlights(data.events, { maxHighlights: 10 });
    const goalCount = data.events.filter(isGoal).length;
    expect(highlights.filter(isGoal).length).toBe(goalCount);
  });

  it('respects the highlight cap', () => {
    const highlights = selectHighlights(data.events, { maxHighlights: 6 });
    expect(highlights.length).toBeLessThanOrEqual(6);
  });

  it('caps non-goal types for variety (default 2)', () => {
    const highlights = selectHighlights(data.events, { maxHighlights: 10 });
    const counts = new Map<string, number>();
    for (const h of highlights.filter((e) => !isGoal(e))) {
      counts.set(h.type, (counts.get(h.type) ?? 0) + 1);
    }
    for (const n of counts.values()) expect(n).toBeLessThanOrEqual(2);
  });
});

describe('story invariants', () => {
  it('passes schema validation', () => {
    const result = validateStory(story);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('starts with a cover page', () => {
    expect(story.pages[0]?.type).toBe('cover');
  });

  it('keeps highlight pages in chronological minute order', () => {
    const minutes = story.pages
      .filter((p) => p.type === 'highlight')
      .map((p) => (p as { minute: number }).minute);
    const sorted = [...minutes].sort((a, b) => a - b);
    expect(minutes).toEqual(sorted);
  });

  it('identifies the story by the match, not the build time', () => {
    expect(story.story_id).toBe('celtic-vs-kilmarnock-2025-11-09');
    expect(story.created_at).toContain('2025-11-09');
  });

  it('is deterministic for a fixed clock', () => {
    const again = buildStory(data, {
      maxHighlights: 10,
      assetsDir: resolve(root, 'assets'),
      now: new Date('2025-11-09T18:00:00Z'),
    });
    expect(again).toEqual(story);
  });
});
