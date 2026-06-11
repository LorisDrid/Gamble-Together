export type Suit = "hearts" | "diamonds" | "clubs" | "spades";
export type Rank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K";

export interface Card {
  suit: Suit;
  rank: Rank;
}

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
}

/** Client-facing game state. The dealer's hole card is never included. */
export interface BlackjackView {
  phase: BlackjackPhase;
  round: number;
  players: BlackjackPlayerView[];
  dealerHand: Card[];
  dealerHiddenCard: boolean;
  currentPlayerId: string | null;
  settings: BlackjackSettings;
}
