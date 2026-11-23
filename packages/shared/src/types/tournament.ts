import type { GameKind } from "./room";

/** Host config: which mini-games (played in `TOURNAMENT_LEGS` order) and how stake legs are played. */
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

/**
 * How a leg is played:
 * - "stake": the host's format (N rounds, or elimination below the min bet) and
 *   the optional rising stakes — betting games with a minimum bet or blinds;
 * - "rounds": always N rounds, no elimination, no rising stakes (Président);
 * - "game": one complete game, whose winner takes the pot (Liar's Dice).
 * Whatever the rule, the leg's point goes to the chip leader(s).
 */
export type LegRule = "stake" | "rounds" | "game";

/** Every game a tournament can chain, in play order, with its rule and the players it needs. */
export const TOURNAMENT_LEGS: ReadonlyArray<{ kind: GameKind; rule: LegRule; minPlayers: number }> = [
  { kind: "blackjack", rule: "stake", minPlayers: 1 },
  { kind: "roulette", rule: "stake", minPlayers: 1 },
  { kind: "baccarat", rule: "stake", minPlayers: 1 },
  { kind: "poker", rule: "stake", minPlayers: 2 },
  { kind: "president", rule: "rounds", minPlayers: 3 },
  { kind: "liarsdice", rule: "game", minPlayers: 2 },
];

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
  /** How the current leg is played, or null when no leg is in play. */
  legRule: LegRule | null;
  /** Indexes in `games` of legs skipped for lack of players (no point awarded). */
  skippedLegs: number[];
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
