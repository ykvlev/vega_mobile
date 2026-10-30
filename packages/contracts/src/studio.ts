import { z } from 'zod';

// Demonstration palette only: these IDs are not SKUs or commercial offers.
export const STUDIO_COLOR_IDS = [
  'graphite',
  'carmine',
  'pearl',
  'forest',
  'cobalt',
  'sand',
] as const;
export const STUDIO_FINISH_IDS = ['gloss', 'satin', 'matte'] as const;
export const StudioChoiceSchema = z.strictObject({
  color: z.enum(STUDIO_COLOR_IDS),
  finish: z.enum(STUDIO_FINISH_IDS),
});
export type StudioChoice = z.infer<typeof StudioChoiceSchema>;
export const DEFAULT_STUDIO_CHOICE: Readonly<StudioChoice> = Object.freeze({
  color: 'graphite',
  finish: 'gloss',
});
export const StudioChoiceMessageSchema = z.strictObject({
  version: z.literal(1),
  type: z.literal('vega-studio-choice'),
  choice: StudioChoiceSchema,
});
