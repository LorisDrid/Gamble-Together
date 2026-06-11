import type { Card } from "../../deck";

export interface PokerSettings {
  startingChips: number;
  smallBlind: number;
  bigBlind: number;
}

export const DEFAULT_POKER_SETTINGS: PokerSettings = {
  startingChips: 1000,
  smallBlind: 5,
  bigBlind: 10,
};

/**
 * "waiting": not enough players to deal. Betting streets: preflop -> flop ->
 * turn -> river. "showdown" also covers hands won by everyone else folding.
 */
export type PokerPhase = "waiting" | "preflop" | "flop" | "turn" | "river" | "showdown";

export interface PokerPlayerView {
  id: string;
  nickname: string;
  chips: number;
  /** Chips wagered on the current street. */
  betThisStreet: number;
  /** Total chips wagered this hand. */
  committed: number;
  folded: boolean;
  allIn: boolean;
  /** Not part of the current hand (joined mid-hand, busted, or waiting). */
  sittingOut: boolean;
  isDealer: boolean;
  /** Own cards always; opponents' only when revealed at showdown. */
  holeCards: Card[] | null;
  holeCardCount: number;
  result: { winnings: number; handName: string | null } | null;
}

/** Legal actions for the viewer, present only when it is their turn. */
export interface PokerTurnOptions {
  toCall: number;
  canCheck: boolean;
  canRaise: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
}

export interface PokerView {
  phase: PokerPhase;
  handNumber: number;
  community: Card[];
  pot: number;
  currentPlayerId: string | null;
  currentBet: number;
  players: PokerPlayerView[];
  settings: PokerSettings;
  /** Set for the viewer when it is their turn to act. */
  turn: PokerTurnOptions | null;
  canStartHand: boolean;
  winners: Array<{ playerId: string; amount: number; handName: string | null }> | null;
}
