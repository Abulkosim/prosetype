/**
 * Client-side mirror of the API's exclude cap (plan §8: "excludes recent ids,
 * cap 20"); sending more than 20 ids is rejected with a 400.
 */
export const MAX_RECENT_PASSAGE_IDS = 20;

/**
 * Append a passage id to the in-memory recent list: a repeated id moves to
 * the end (most recent), and the list is capped by dropping the oldest.
 */
export function pushRecent(
  ids: readonly number[],
  id: number,
  cap: number = MAX_RECENT_PASSAGE_IDS,
): number[] {
  const next = ids.filter((known) => known !== id);
  next.push(id);
  return next.length > cap ? next.slice(next.length - cap) : next;
}
