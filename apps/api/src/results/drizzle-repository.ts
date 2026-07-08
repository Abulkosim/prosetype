import type { Band } from '@prosetype/schema';
import { desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { authors, passages, results, works } from '../db/schema.ts';
import type {
  NewResult,
  ProfileAggregates,
  ResultRepository,
  StoredResultRow,
} from './repository.ts';

/** postgres.js returns numeric aggregates as strings; coerce, preserving null. */
function toNumberOrNull(value: string | null): number | null {
  return value === null ? null : Number(value);
}

/** Drizzle-backed ResultRepository. */
export function createDrizzleResultRepository(db: Db): ResultRepository {
  return {
    async insert(row: NewResult): Promise<number> {
      const [inserted] = await db
        .insert(results)
        .values({
          profileId: row.profileId,
          passageId: row.passageId,
          wpm: row.wpm,
          rawWpm: row.rawWpm,
          accuracy: row.accuracy,
          consistency: row.consistency,
          durationMs: row.durationMs,
          charEvents: row.charEvents,
          clientMatch: row.clientMatch,
        })
        .returning({ id: results.id });
      if (inserted === undefined) {
        throw new Error('result insert returned no row');
      }
      return inserted.id;
    },

    async recentForProfile(profileId: string, limit: number): Promise<StoredResultRow[]> {
      const rows = await db
        .select({
          id: results.id,
          passageId: results.passageId,
          wpm: results.wpm,
          rawWpm: results.rawWpm,
          accuracy: results.accuracy,
          consistency: results.consistency,
          durationMs: results.durationMs,
          clientMatch: results.clientMatch,
          createdAt: results.createdAt,
          band: passages.band,
          workTitle: works.title,
          authorName: authors.name,
          authorSlug: authors.slug,
          passageText: passages.text,
          charEvents: results.charEvents,
        })
        .from(results)
        .innerJoin(passages, eq(results.passageId, passages.id))
        .innerJoin(works, eq(passages.workId, works.id))
        .innerJoin(authors, eq(works.authorId, authors.id))
        .where(eq(results.profileId, profileId))
        .orderBy(desc(results.createdAt), desc(results.id))
        .limit(limit);
      return rows.map((r) => ({ ...r, band: r.band as Band }));
    },

    async aggregatesForProfile(profileId: string): Promise<ProfileAggregates> {
      const [totals] = await db
        .select({
          tests: sql<number>`count(*)::int`,
          timeTypedMs: sql<number>`coalesce(sum(${results.durationMs}), 0)::bigint`,
          avgAccuracy: sql<string | null>`avg(${results.accuracy})`,
          avgConsistency: sql<string | null>`avg(${results.consistency})`,
        })
        .from(results)
        .where(eq(results.profileId, profileId));

      const [best] = await db
        .select({
          wpm: results.wpm,
          passageId: results.passageId,
          workTitle: works.title,
          authorName: authors.name,
        })
        .from(results)
        .innerJoin(passages, eq(results.passageId, passages.id))
        .innerJoin(works, eq(passages.workId, works.id))
        .innerJoin(authors, eq(works.authorId, authors.id))
        .where(eq(results.profileId, profileId))
        .orderBy(desc(results.wpm), desc(results.id))
        .limit(1);

      const perAuthorRows = await db
        .select({
          authorSlug: authors.slug,
          authorName: authors.name,
          tests: sql<number>`count(*)::int`,
          avgWpm: sql<string>`avg(${results.wpm})`,
        })
        .from(results)
        .innerJoin(passages, eq(results.passageId, passages.id))
        .innerJoin(works, eq(passages.workId, works.id))
        .innerJoin(authors, eq(works.authorId, authors.id))
        .where(eq(results.profileId, profileId))
        .groupBy(authors.slug, authors.name)
        .orderBy(desc(sql`avg(${results.wpm})`), authors.name);

      return {
        tests: totals?.tests ?? 0,
        // bigint comes back as a string from postgres.js; realistic dev totals
        // are well within Number's safe range.
        timeTypedMs: Number(totals?.timeTypedMs ?? 0),
        avgAccuracy: toNumberOrNull(totals?.avgAccuracy ?? null),
        avgConsistency: toNumberOrNull(totals?.avgConsistency ?? null),
        best: best === undefined ? null : best,
        perAuthor: perAuthorRows.map((r) => ({
          authorSlug: r.authorSlug,
          authorName: r.authorName,
          tests: r.tests,
          avgWpm: Number(r.avgWpm),
        })),
      };
    },
  };
}
