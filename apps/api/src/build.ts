import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from './config.ts';
import { createDbClient } from './db/client.ts';
import { createDrizzlePassageRepository } from './passages/drizzle-repository.ts';
import type { PassageRepository } from './passages/repository.ts';
import { passageRoutes } from './routes/passages.ts';

/**
 * Optional dependency overrides so tests can substitute the data layer
 * (unit tests run with a stubbed PassageRepository, no live Postgres).
 */
export interface AppDeps {
  passageRepo?: PassageRepository;
}

/**
 * App factory, separate from listen (plan §3) so tests can use `app.inject()`.
 */
export async function buildApp(config: AppConfig, deps: AppDeps = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.NODE_ENV !== 'test',
  });

  await app.register(cors, {
    origin: config.CORS_ORIGIN,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  let passageRepo = deps.passageRepo;
  if (passageRepo === undefined) {
    // postgres.js connects lazily, so building the app never blocks on the DB.
    const client = createDbClient(config.DATABASE_URL);
    passageRepo = createDrizzlePassageRepository(client.db);
    app.addHook('onClose', async () => {
      await client.sql.end();
    });
  }

  app.get('/api/v1/healthz', async () => ({ ok: true as const }));

  await app.register(passageRoutes, { prefix: '/api/v1', repo: passageRepo });

  return app;
}
