import { passageSchema, type Passage } from '@prosetype/schema';

/**
 * GET /api/v1/passages/next (plan §8), excluding recently seen passage ids.
 * The Vite dev server proxies /api → the Fastify app on :3001. The response
 * is re-parsed through the shared zod schema so API drift fails loudly.
 */
export async function fetchNextPassage(excludeIds: readonly number[]): Promise<Passage> {
  const query = excludeIds.length > 0 ? `?exclude=${excludeIds.join(',')}` : '';
  const response = await fetch(`/api/v1/passages/next${query}`);
  if (!response.ok) {
    throw new Error(`GET /passages/next failed with status ${String(response.status)}`);
  }
  const body: unknown = await response.json();
  return passageSchema.parse(body);
}
