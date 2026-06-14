import type { GameKind } from "./room";

/** Host config: which mini-games (fixed order) and how each leg is played. */
export interface TournamentSettings {
  games: GameKind[];
  startingChips: number;
  /** When true, a leg lasts `roundsPerLeg` rounds (chip leader wins). When
   *  false, a leg runs by elimination until one player is left in. */
  roundLimited: boolean;
  roundsPerLeg: number;
  /** When true, the minimum stake (blinds in poker) rises each time a player is
   *  knocked out: base × (eliminated + 1). Rebuy is disabled during tournaments. */
  escalate: boolean;
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
  /** False = elimination format (play until one player remains). */
  roundLimited: boolean;
  escalate: boolean;
  /** Current stake multiplier for the leg (1 unless escalation knocked players out). */
  stakeMultiplier: number;
  /** Nicknames eliminated from the current leg (escalation/elimination format). */
  eliminated: string[];
  /** Players sorted by points (desc). */
  standings: TournamentStanding[];
  /** Nicknames who won the leg that just finished (intermission & done). */
  lastWinners: string[];
}

export const MIN_TOURNAMENT_GAMES = 2;
export const DEFAULT_ROUNDS_PER_LEG = 3;
