import type { Band, Passage } from '@prosetype/schema';

/**
 * Filters for random passage selection (plan §8, GET /passages/next).
 * All filters are optional and combine with AND.
 */
export interface PassageFilter {
  band?: Band | undefined;
  /** Theme slug; matches passages whose themes array contains it. */
  theme?: string | undefined;
  /** Author slug. */
  author?: string | undefined;
  /** Recently seen passage ids to exclude; route validation caps this at 20. */
  excludeIds: number[];
}

/**
 * Data access for passages, kept behind an interface so route tests can
 * substitute a stub (no live Postgres in unit tests until Phase 2 CI).
 */
export interface PassageRepository {
  /** A random passage matching the filter, or null when none match. */
  findRandom(filter: PassageFilter): Promise<Passage | null>;
  /** A passage by id with full attribution, or null when absent. */
  findById(id: number): Promise<Passage | null>;
}
