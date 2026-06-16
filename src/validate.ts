/**
 * Stage 5 of the pipeline: VALIDATE.
 *
 * Checks the assembled Story against a Zod schema, plus a few invariants the
 * schema cannot express: the first page must be a cover, and highlight pages
 * must be in non-decreasing minute order.
 *
 * Pipeline: load -> score -> rank -> build -> [validate]
 */
import { z } from 'zod';
import type { Story } from './types.js';

const CoverPageSchema = z.looseObject({
  type: z.literal('cover'),
  headline: z.string(),
  subheadline: z.string().optional(),
  image: z.string(),
});

const HighlightPageSchema = z.looseObject({
  type: z.literal('highlight'),
  minute: z.number().int().min(0).max(130),
  headline: z.string(),
  caption: z.string(),
  image: z.string().optional(),
  explanation: z.string().optional(),
});

const InfoPageSchema = z.looseObject({
  type: z.literal('info'),
  headline: z.string(),
  body: z.string().optional(),
});

const StorySchema = z.strictObject({
  story_id: z.string().min(1),
  title: z.string().min(1),
  source: z.string().min(1),
  created_at: z.iso.datetime(),
  metrics: z.record(z.string(), z.unknown()).optional(),
  pages: z
    .array(z.discriminatedUnion('type', [CoverPageSchema, HighlightPageSchema, InfoPageSchema]))
    .min(1),
});

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Schema validation plus a few invariants the schema alone can't express. */
export function validateStory(story: Story): ValidationResult {
  const result = StorySchema.safeParse(story);
  const errors: string[] = [];

  if (!result.success) {
    for (const issue of result.error.issues) {
      const path = issue.path.join('.') || '/';
      errors.push(`${path} ${issue.message}`);
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
