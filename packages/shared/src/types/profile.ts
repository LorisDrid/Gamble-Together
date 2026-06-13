/**
 * Persistent guest profile, keyed server-side by a device token (stored in the
 * browser's localStorage). No password — "guest-first". Chips stay per-table;
 * what persists is identity + cumulative stats (foundation for leaderboards).
 */
export interface PlayerProfile {
  nickname: string;
  /** Rounds/hands the player has finished, across all games and sessions. */
  roundsPlayed: number;
  /** Cumulative net chip change (winnings minus losses) over all rounds. */
  netTotal: number;
  /** Largest single-round net gain. */
  biggestWin: number;
}

/** Stats a leaderboard can be ranked by. */
export type LeaderboardMetric = "netTotal" | "biggestWin" | "roundsPlayed";

export interface LeaderboardEntry {
  rank: number;
  nickname: string;
  netTotal: number;
  biggestWin: number;
  roundsPlayed: number;
  /** True for the requesting device's own row, so the UI can highlight it. */
  isMe: boolean;
}
