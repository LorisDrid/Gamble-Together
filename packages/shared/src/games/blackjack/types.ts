import type { Card } from "../../deck";

export interface BlackjackSettings {
  startingChips: number;
  minBet: number;
  deckCount: number;
}

export const DEFAULT_BLACKJACK_SETTINGS: BlackjackSettings = {
  startingChips: 1000,
  minBet: 10,
  deckCount: 6,
};

export type BlackjackPhase = "betting" | "playing" | "payout";

export type RoundResult = "win" | "lose" | "push" | "blackjack";

export interface BlackjackPlayerView {
  id: string;
  nickname: string;
  chips: number;
  bet: number | null;
  hand: Card[];
  /** False for players who joined mid-round or sat out — they play next round. */
  inRound: boolean;
  hasStood: boolean;
  result: RoundResult | null;
  /** True while this player can still hit/stand (players act in parallel). */
  canAct: boolean;
}

/** Client-facing game state. The dealer's hole card is never included. */
export interface BlackjackView {
  phase: BlackjackPhase;
  round: number;
  players: BlackjackPlayerView[];
  dealerHand: Card[];
  dealerHiddenCard: boolean;
  settings: BlackjackSettings;
}
