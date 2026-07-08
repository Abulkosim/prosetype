import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { profiles } from '../db/schema.ts';
import type { ProfileRepository } from './repository.ts';

/** Drizzle-backed ProfileRepository. */
export function createDrizzleProfileRepository(db: Db): ProfileRepository {
  return {
    async create(): Promise<string> {
      const [row] = await db.insert(profiles).values({}).returning({ id: profiles.id });
      if (row === undefined) {
        throw new Error('profile insert returned no row');
      }
      return row.id;
    },

    async exists(id: string): Promise<boolean> {
      const rows = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.id, id))
        .limit(1);
      return rows.length > 0;
    },
  };
}
