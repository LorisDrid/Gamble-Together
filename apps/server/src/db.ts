import { DatabaseSync } from "node:sqlite";
import {
  NICKNAME_MAX_LENGTH,
  type LeaderboardEntry,
  type LeaderboardMetric,
  type PlayerProfile,
} from "@gamble/shared";

/**
 * Tiny persistence layer (built-in node:sqlite — no native deps, ideal for the
 * Raspberry Pi). Stores one row per guest, keyed by a device token. Chips stay
 * per-table; what we keep is identity (nickname) + cumulative stats.
 *
 * DB_PATH env var overrides the file location (default: ./gamble.db next to the
 * server). Use ":memory:" for ephemeral storage (tests).
 */
const DB_PATH = process.env.DB_PATH ?? "gamble.db";

const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    token TEXT PRIMARY KEY,
    nickname TEXT NOT NULL DEFAULT '',
    rounds_played INTEGER NOT NULL DEFAULT 0,
    net_total INTEGER NOT NULL DEFAULT 0,
    biggest_win INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL
  );
`);

const selectStmt = db.prepare(
  "SELECT nickname, rounds_played, net_total, biggest_win FROM players WHERE token = ?",
);
const insertStmt = db.prepare(
  "INSERT INTO players (token, nickname, created_at, last_seen) VALUES (?, ?, ?, ?)",
);
const touchStmt = db.prepare("UPDATE players SET nickname = ?, last_seen = ? WHERE token = ?");
const recordStmt = db.prepare(
  `UPDATE players
     SET rounds_played = rounds_played + 1,
         net_total = net_total + ?,
         biggest_win = MAX(biggest_win, ?),
         last_seen = ?
   WHERE token = ?`,
);

interface PlayerRow {
  nickname: string;
  rounds_played: number;
  net_total: number;
  biggest_win: number;
}

function toProfile(row: PlayerRow): PlayerProfile {
  return {
    nickname: row.nickname,
    roundsPlayed: row.rounds_played,
    netTotal: row.net_total,
    biggestWin: row.biggest_win,
  };
}

function isValidToken(token: unknown): token is string {
  // Client-generated UUIDs; accept any reasonable opaque string
  return typeof token === "string" && token.length >= 8 && token.length <= 100;
}

/** Upserts the guest (creating it on first sight), refreshes the nickname, returns the profile. */
export function syncProfile(token: unknown, nickname?: unknown): PlayerProfile | null {
  if (!isValidToken(token)) return null;
  const cleanName =
    typeof nickname === "string" ? nickname.trim().slice(0, NICKNAME_MAX_LENGTH) : "";
  const now = Date.now();

  const existing = selectStmt.get(token) as PlayerRow | undefined;
  if (!existing) {
    insertStmt.run(token, cleanName, now, now);
    return toProfile({ nickname: cleanName, rounds_played: 0, net_total: 0, biggest_win: 0 });
  }
  // Keep the latest non-empty nickname
  const nextName = cleanName.length > 0 ? cleanName : existing.nickname;
  touchStmt.run(nextName, now, token);
  return toProfile({ ...existing, nickname: nextName });
}

/** Adds one finished round to the guest's cumulative stats. */
export function recordRound(token: string | undefined, net: number): void {
  if (!isValidToken(token) || !Number.isFinite(net)) return;
  const win = net > 0 ? net : 0;
  recordStmt.run(Math.round(net), Math.round(win), Date.now(), token);
}

// Statements are prepared per metric so the sort column is never interpolated
// from client input — only these three fixed columns are ever used.
const leaderboardStmts: Record<LeaderboardMetric, ReturnType<DatabaseSync["prepare"]>> = {
  netTotal: prepareLeaderboard("net_total"),
  biggestWin: prepareLeaderboard("biggest_win"),
  roundsPlayed: prepareLeaderboard("rounds_played"),
};

function prepareLeaderboard(column: string) {
  return db.prepare(
    `SELECT token, nickname, rounds_played, net_total, biggest_win
       FROM players
      WHERE nickname != '' AND rounds_played > 0
      ORDER BY ${column} DESC, rounds_played DESC
      LIMIT ?`,
  );
}

interface LeaderboardRow extends PlayerRow {
  token: string;
}

/** Top `limit` players for the metric; flags the requester's own row. */
export function getLeaderboard(
  metric: LeaderboardMetric,
  limit: number,
  requesterToken: unknown,
): LeaderboardEntry[] {
  const stmt = leaderboardStmts[metric] ?? leaderboardStmts.netTotal;
  const rows = stmt.all(limit) as unknown as LeaderboardRow[];
  return rows.map((row, i) => ({
    rank: i + 1,
    nickname: row.nickname,
    netTotal: row.net_total,
    biggestWin: row.biggest_win,
    roundsPlayed: row.rounds_played,
    isMe: isValidToken(requesterToken) && row.token === requesterToken,
  }));
}
