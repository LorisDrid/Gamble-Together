import type { Rank, Suit } from "../../deck";

/**
 * A Président card. Normal cards carry suit + rank (suit is cosmetic — only rank
 * matters for play); jokers are a distinct top rank (two of them, not wild).
 */
export type PresidentCard =
  | { kind: "normal"; suit: Suit; rank: Rank }
  | { kind: "joker"; id: 0 | 1 };

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
 * Rank strength order for normal cards (weakest → strongest). The 2 (bomb) and
 * the joker (top) are handled specially, not via this list.
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
];

export interface PresidentPlayerView {
  id: string;
  nickname: string;
  /** Number of cards still in hand. */
  handCount: number;
  /** The actual hand — only sent to that player. */
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
  /** The combination sitting on top, or null when the trick is fresh. */
  pile: { cards: PresidentCard[]; count: number } | null;
  /** True while card order is reversed (a quad triggered a révolution). */
  reversed: boolean;
  /** Current pot (chips) up for grabs this round. */
  pot: number;
  /** Exchanges still owed (during the "exchange" phase). */
  pendingReturns: PresidentReturn[];
  /** Player ids in the order they finished (Président first). */
  finishingOrder: string[];
}
