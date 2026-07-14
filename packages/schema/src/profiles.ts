import { z } from 'zod';

/** POST /profiles response body - create an anonymous profile (plan §8, §9.2). */
export const postProfilesResponseSchema = z.object({
  id: z.uuid(),
});

export type PostProfilesResponse = z.infer<typeof postProfilesResponseSchema>;

/**
 * GET /profiles/:id response (Batch D, §3.1 account management): the
 * requesting client's own profile info, used by the /account page. `email` is
 * returned only to the bearer of `id` - never on the leaderboard or to
 * another profile.
 */
export const getProfileResponseSchema = z.object({
  id: z.uuid(),
  displayName: z.string().nullable(),
  claimed: z.boolean(),
  email: z.string().nullable(),
});
export type GetProfileResponse = z.infer<typeof getProfileResponseSchema>;

/**
 * PATCH /profiles/:id body (§3.1): rename the display name shown on the
 * leaderboard. Response reuses getProfileResponseSchema.
 */
export const renameProfileRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(32),
});
export type RenameProfileRequest = z.infer<typeof renameProfileRequestSchema>;
