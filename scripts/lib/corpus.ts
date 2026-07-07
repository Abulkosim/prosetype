/**
 * Parsing + validation of `corpus/passages.yaml` per plan §5.
 * zod at the I/O boundary; strict objects so curator typos fail loudly.
 */
import { parse } from 'yaml';
import { z } from 'zod';

import { BANDS } from './difficulty.ts';

export const passageEntrySchema = z.strictObject({
  author: z.string().min(1),
  author_name: z.string().min(1),
  era: z.string().min(1).optional(),
  birth_year: z.int().optional(),
  death_year: z.int().optional(),
  work: z.string().min(1),
  title: z.string().min(1),
  translator: z.string().min(1).optional(),
  pub_year: z.int().optional(),
  source: z.string().min(1),
  language: z.string().min(1).default('en'),
  themes: z.array(z.string().min(1)).default([]),
  band_override: z.enum(BANDS).optional(),
  text: z.string().min(1),
});

export type PassageEntry = z.infer<typeof passageEntrySchema>;

export const corpusSchema = z.array(passageEntrySchema).min(1);

/** Parse the YAML source of corpus/passages.yaml into validated entries. */
export function parseCorpus(yamlSource: string): PassageEntry[] {
  const raw: unknown = parse(yamlSource);
  return corpusSchema.parse(raw);
}
