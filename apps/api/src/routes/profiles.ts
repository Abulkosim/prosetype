import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ProfileRepository } from '../profiles/repository.ts';
import type { ResultRepository } from '../results/repository.ts';
import { buildProfileStats } from '../results/stats.ts';
import { sendBadRequest, sendNotFound } from './http.ts';

/** Most recent results returned in the stats history list (plan §8: "last 50"). */
export const STATS_HISTORY_LIMIT = 50;

const statsParamsSchema = z.object({ id: z.uuid() });

export interface ProfileRoutesOptions {
  profiles: ProfileRepository;
  results: ResultRepository;
}

/**
 * POST /profiles (create anon profile) and GET /profiles/:id/stats
 * (aggregates + history), plan §8. Registered under the /api/v1 prefix.
 */
export async function profileRoutes(
  app: FastifyInstance,
  opts: ProfileRoutesOptions,
): Promise<void> {
  const { profiles, results } = opts;

  app.post('/profiles', async (_request, reply) => {
    const id = await profiles.create();
    return reply.code(201).send({ id });
  });

  app.get('/profiles/:id/stats', async (request, reply) => {
    const parsed = statsParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return sendBadRequest(reply, parsed.error);
    }
    const { id } = parsed.data;
    if (!(await profiles.exists(id))) {
      return sendNotFound(reply, `Profile ${id} not found`);
    }
    const [aggregates, recent] = await Promise.all([
      results.aggregatesForProfile(id),
      results.recentForProfile(id, STATS_HISTORY_LIMIT),
    ]);
    return buildProfileStats(aggregates, recent);
  });
}
