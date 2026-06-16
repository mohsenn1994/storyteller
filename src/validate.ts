/**
 * Stage 5 of the pipeline: VALIDATE.
 *
 * Checks the assembled Story against the (corrected) JSON Schema using Ajv, plus
 * a few invariants the schema cannot express on its own: the first page must be
 * a cover, and highlight pages must be in non-decreasing minute order.
 *
 * Pipeline: load -> score -> rank -> build -> [validate]
 */
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import type { Story } from './types.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Schema validation plus a few invariants the schema alone can't express. */
export function validateStory(story: Story, schemaPath: string): ValidationResult {
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
  const validate = ajv.compile(schema);
  const valid = validate(story);

  const errors: string[] = [];
  if (!valid) {
    for (const e of validate.errors ?? []) {
      errors.push(`${e.instancePath || '/'} ${e.message ?? ''}`.trim());
    }
  }

  // Invariants beyond the schema:
  if (story.pages[0]?.type !== 'cover') errors.push('first page must be a cover');
  const highlights = story.pages.filter((p) => p.type === 'highlight');
  for (let i = 1; i < highlights.length; i++) {
    const prev = highlights[i - 1] as { minute: number };
    const cur = highlights[i] as { minute: number };
    if (cur.minute < prev.minute) {
      errors.push('highlight pages are not in chronological order');
      break;
    }
  }

  return { valid: errors.length === 0, errors };
}
