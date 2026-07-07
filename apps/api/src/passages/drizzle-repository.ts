import { passageSchema, type Passage } from '@prosetype/schema';
import { and, arrayContains, eq, notInArray, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { authors, passages, works } from '../db/schema.ts';
import type { PassageFilter, PassageRepository } from './repository.ts';

/** Selection shaped exactly like the shared Passage DTO (nested attribution). */
const passageSelection = {
  id: passages.id,
  text: passages.text,
  charCount: passages.charCount,
  wordCount: passages.wordCount,
  difficulty: passages.difficulty,
  band: passages.band,
  themes: passages.themes,
  language: passages.language,
  work: {
    slug: works.slug,
    title: works.title,
    translator: works.translator,
    pubYear: works.pubYear,
  },
  author: {
    slug: authors.slug,
    name: authors.name,
    era: authors.era,
  },
};

/**
 * Drizzle-backed PassageRepository. Rows are parsed through the shared
 * passageSchema so any DB/DTO drift fails loudly instead of leaking out.
 */
export function createDrizzlePassageRepository(db: Db): PassageRepository {
  const baseQuery = () =>
    db
      .select(passageSelection)
      .from(passages)
      .innerJoin(works, eq(passages.workId, works.id))
      .innerJoin(authors, eq(works.authorId, authors.id));

  return {
    async findRandom(filter: PassageFilter): Promise<Passage | null> {
      const conditions: SQL[] = [];
      if (filter.band !== undefined) {
        conditions.push(eq(passages.band, filter.band));
      }
      if (filter.theme !== undefined) {
        conditions.push(arrayContains(passages.themes, [filter.theme]));
      }
      if (filter.author !== undefined) {
        conditions.push(eq(authors.slug, filter.author));
      }
      if (filter.excludeIds.length > 0) {
        conditions.push(notInArray(passages.id, filter.excludeIds));
      }
      // ORDER BY random() scans every matching row; fine at the ~30-row seed
      // corpus scale (plan §8 sizing) — revisit if the corpus grows large.
      const rows = await baseQuery()
        .where(and(...conditions))
        .orderBy(sql`random()`)
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : passageSchema.parse(row);
    },

    async findById(id: number): Promise<Passage | null> {
      const rows = await baseQuery().where(eq(passages.id, id)).limit(1);
      const row = rows[0];
      return row === undefined ? null : passageSchema.parse(row);
    },
  };
}
