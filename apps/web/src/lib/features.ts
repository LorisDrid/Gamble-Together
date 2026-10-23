/**
 * Front-end feature flags.
 *
 * Persistence features (a returning player's cumulative stats + the leaderboard)
 * rely on a durable server-side SQLite DB. On a host with an ephemeral
 * filesystem (e.g. a free cloud tier) that DB resets on every restart/redeploy,
 * so those UI cards would show numbers that keep vanishing — which reads as
 * "broken". Hide them there, and surface them again once storage is persistent.
 *
 * Default ON. Only an explicit NEXT_PUBLIC_STATS_ENABLED="false" turns it off,
 * so local dev and the self-hosted mini PC are unaffected; set it to "false" on
 * the cloud stopgap (Vercel) and remove it when self-hosting.
 *
 * NEXT_PUBLIC_* is inlined at build time — changing it requires a redeploy.
 */
export const STATS_ENABLED = process.env.NEXT_PUBLIC_STATS_ENABLED !== "false";
