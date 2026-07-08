/**
 * Data access for anonymous profiles (plan §4, §8, §9.2). Kept behind an
 * interface so route tests can substitute an in-memory stub (no live Postgres
 * in unit tests).
 */
export interface ProfileRepository {
  /** Create an anonymous profile; returns its generated uuid. */
  create(): Promise<string>;
  /** Whether a profile with this id exists. */
  exists(id: string): Promise<boolean>;
}
