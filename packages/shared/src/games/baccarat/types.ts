import type { Card } from "../../deck";

export interface BaccaratSettings {
  startingChips: number;
  minBet: number;
  /** Number of 52-card decks in the shoe. */
  deckCount: number;
}

export const DEFAULT_BACCARAT_SETTINGS: BaccaratSettings = {
  startingChips: 1000,
  minBet: 10,
  deckCount: 6,
};

export type BaccaratPhase = "betting" | "result";

/** Which side a coup resolved to. */
export type BaccaratOutcome = "player" | "banker" | "tie";

/** A wager: on the Player, the Banker, or a Tie. */
export type BaccaratBetKind = "player" | "banker" | "tie";

export interface BaccaratBet {
  kind: BaccaratBetKind;
  amount: number;
}

export interface BaccaratPlayerView {
  id: string;
  nickname: string;
  chips: number;
  bets: BaccaratBet[];
  ready: boolean;
  /** Net chips from the last resolved coup, or null before the first result. */
  lastNet: number | null;
}

/** Client-facing state (shared — both hands are public in baccarat). */
export interface BaccaratView {
  phase: BaccaratPhase;
  round: number;
  players: BaccaratPlayerView[];
  /** The two dealt hands, shown at the result (empty during betting). */
  playerHand: Card[];
  bankerHand: Card[];
  /** The resolved outcome, or null while still betting. */
  outcome: BaccaratOutcome | null;
  settings: BaccaratSettings;
}

/** Banker wins pay 1:1 minus a 5% commission (the house edge on the better bet). */
export const BACCARAT_BANKER_COMMISSION = 0.05;
/** A winning Tie bet pays 8:1. */
export const BACCARAT_TIE_PAYOUT = 8;
