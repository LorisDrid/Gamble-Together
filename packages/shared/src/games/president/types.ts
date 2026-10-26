import type { Rank, Suit } from "../../deck";

/**
 * A Président card. Normal cards carry suit + rank (suit is cosmetic — only rank
 * matters for play). This game uses 52 cards, without jokers.
 */
export type PresidentCard = { kind: "normal"; suit: Suit; rank: Rank };

export type PresidentPhase = "exchange" | "playing" | "done";

/** Min / max players for a sensible game. */
export const PRESIDENT_MIN_PLAYERS = 3;
export const PRESIDENT_MAX_PLAYERS = 7;

export interface PresidentSettings {
  startingChips: number;
  /** Chips each player antes into the pot at the start of every round. */
  ante: number;
}

export const DEFAULT_PRESIDENT_SETTINGS: PresidentSettings = {
  startingChips: 1000,
  ante: 50,
};

/**
 * Rank strength order outside revolution (weakest → strongest).
 */
export const PRESIDENT_NORMAL_ORDER: readonly Rank[] = [
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
  "2",
];

export interface PresidentPlayerView {
  id: string;
  nickname: string;
  /** Number of cards still in hand. */
  handCount: number;
  /** Own hand only, sorted weakest to strongest under the current rank order. */
  hand: PresidentCard[] | null;
  /** Chips (between rounds; the ante is already taken into the pot). */
  chips: number;
  /** Net chips from the last settled round, or null if none yet. */
  lastNet: number | null;
  /** True once this player has emptied their hand. */
  finished: boolean;
  /** Finishing position (1 = Président) once finished, else null. */
  rank: number | null;
  /** True if this player has passed the current trick. */
  passed: boolean;
}

/** A card return owed during the exchange (the higher rank gives back to the lower). */
export interface PresidentReturn {
  fromId: string;
  toId: string;
  count: number;
}

export interface PresidentView {
  phase: PresidentPhase;
  round: number;
  players: PresidentPlayerView[];
  /** Whose turn it is, or null when the round is done. */
  currentPlayerId: string | null;
  /** Top combination and uninterrupted rank count (including previous equal plays). */
  pile: { cards: PresidentCard[]; count: number; sameRankCount: number } | null;
  /** True while card order is reversed (a quad triggered a révolution). */
  reversed: boolean;
  /** Current pot (chips) up for grabs this round. */
  pot: number;
  /** Exchanges still owed (during the "exchange" phase). */
  pendingReturns: PresidentReturn[];
  /** Player ids in the order they finished (Président first). */
  finishingOrder: string[];
}
