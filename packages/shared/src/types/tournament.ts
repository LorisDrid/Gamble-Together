import type { GameKind } from "./room";

/** Host config: which mini-games (fixed order), rounds per leg, buy-in per leg. */
export interface TournamentSettings {
  games: GameKind[];
  roundsPerLeg: number;
  startingChips: number;
}

export type TournamentPhase = "playing" | "intermission" | "done";

export interface TournamentStanding {
  playerId: string;
  nickname: string;
  points: number;
}

/** Overlay state broadcast alongside the current leg's `game:state`. */
export interface TournamentView {
  /** The ordered legs (mini-games). */
  games: GameKind[];
  /** 0-based index of the leg being played, or the one that just ended. */
  legIndex: number;
  roundsPerLeg: number;
  /** The game currently in play, or null during intermission / once done. */
  currentGame: GameKind | null;
  phase: TournamentPhase;
  /** Players sorted by points (desc). */
  standings: TournamentStanding[];
  /** Nicknames who won the leg that just finished (intermission & done). */
  lastWinners: string[];
}

export const MIN_TOURNAMENT_GAMES = 2;
export const DEFAULT_ROUNDS_PER_LEG = 3;
