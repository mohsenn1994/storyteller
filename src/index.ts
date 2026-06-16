/**
 * CLI entry point: wires the pipeline together.
 *
 * load -> build (score + rank + captions) -> validate -> write outputs.
 * Writes out/story.json (the deliverable) and preview/story.data.js (a shim so
 * the viewer opens by double-click, no server needed). Fails with a readable
 * message rather than a raw stack trace.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStory } from './build';
import { load } from './load';
import { validateStory } from './validate';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function main(): void {
  const dataDir = resolve(root, 'data');
  const assetsDir = resolve(root, 'assets');
  const outPath = resolve(root, 'out', 'story.json');
  const viewerDataPath = resolve(root, 'preview', 'story.data.js');

  const data = load(dataDir);
  const story = buildStory(data, { maxHighlights: 10, assetsDir });

  const result = validateStory(story);
  if (!result.valid) {
    console.error('✗ Story failed validation:');
    for (const e of result.errors) console.error('  -', e);
    process.exitCode = 1;
    return;
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(story, null, 2));

  // Emit a JS shim so preview/index.html opens by double-click (no CORS/server).
  writeFileSync(viewerDataPath, `window.STORY = ${JSON.stringify(story, null, 2)};\n`);

  console.log('✓ Story built and validated');
  console.log(`  ${story.pages.length} pages → ${outPath}`);
  console.log(`  viewer data → ${viewerDataPath}`);
}

try {
  main();
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('✗ Could not build the story.');
  console.error(`  ${msg}`);
  console.error('  Check that data/match_events.json and the squad files exist and are valid JSON.');
  process.exitCode = 1;
}
