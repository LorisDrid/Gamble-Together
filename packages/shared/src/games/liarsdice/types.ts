export interface LiarsDiceSettings {
  startingChips: number;
  /** Chips each player antes into the pot at the start of the game. */
  ante: number;
  /** Dice each player starts with. */
  diceCount: number;
}

export const DEFAULT_LIARS_DICE_SETTINGS: LiarsDiceSettings = {
  startingChips: 1000,
  ante: 100,
  diceCount: 5,
};

export const LIARS_DICE_MIN_PLAYERS = 2;
export const LIARS_DICE_MAX_PLAYERS = 6;

export type LiarsDicePhase = "bidding" | "reveal" | "done";

/** A bid: at least `quantity` dice showing `face` (1–6) across the whole table. */
export interface LiarsDiceBid {
  quantity: number;
  face: number;
}

export interface LiarsDicePlayerView {
  id: string;
  nickname: string;
  /** Dice still in this player's cup. */
  diceCount: number;
  /** The actual dice — shown to their owner, and to everyone at a reveal/showdown. */
  dice: number[] | null;
  chips: number;
  lastNet: number | null;
  eliminated: boolean;
}

/** What a challenge ("Menteur !") uncovered, shown during the reveal phase. */
export interface LiarsDiceReveal {
  bid: LiarsDiceBid;
  /** Actual count of the bid's face (wild 1s included unless betting on 1s). */
  actual: number;
  challengerId: string;
  bidderId: string;
  /** Who lost a die. */
  loserId: string;
}

export interface LiarsDiceView {
  phase: LiarsDicePhase;
  round: number;
  players: LiarsDicePlayerView[];
  /** Whose turn it is to bid or challenge, or null when done. */
  currentPlayerId: string | null;
  /** The standing bid, or null at the start of a round. */
  currentBid: LiarsDiceBid | null;
  /** Who made the standing bid. */
  bidderId: string | null;
  pot: number;
  /** Set during "reveal" (and kept at "done" for the final showdown). */
  reveal: LiarsDiceReveal | null;
  /** Winner id once the game is done. */
  winnerId: string | null;
}
