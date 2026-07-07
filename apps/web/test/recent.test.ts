import { describe, expect, it } from 'vitest';

import { MAX_RECENT_PASSAGE_IDS, pushRecent } from '../src/lib/recent';

describe('pushRecent', () => {
  it('appends a new id', () => {
    expect(pushRecent([1, 2], 3)).toEqual([1, 2, 3]);
  });

  it('moves a repeated id to the end without duplicating', () => {
    expect(pushRecent([1, 2, 3], 2)).toEqual([1, 3, 2]);
  });

  it('drops the oldest id past the cap', () => {
    const full = Array.from({ length: MAX_RECENT_PASSAGE_IDS }, (_, i) => i + 1);
    const next = pushRecent(full, 99);
    expect(next).toHaveLength(MAX_RECENT_PASSAGE_IDS);
    expect(next[0]).toBe(2);
    expect(next.at(-1)).toBe(99);
  });

  it('does not mutate the input list', () => {
    const ids = [1, 2, 3];
    pushRecent(ids, 4);
    expect(ids).toEqual([1, 2, 3]);
  });

  it('caps at 20 to mirror the API exclude limit', () => {
    expect(MAX_RECENT_PASSAGE_IDS).toBe(20);
  });
});
