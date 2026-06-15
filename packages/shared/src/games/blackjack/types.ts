import type { Card } from "../../deck";

export interface BlackjackSettings {
  startingChips: number;
  minBet: number;
  deckCount: number;
  /** "Blackjack Sabotage" mode: drawing a Valet on a hit may grant a power. */
  sabotage?: boolean;
}

export const DEFAULT_BLACKJACK_SETTINGS: BlackjackSettings = {
  startingChips: 1000,
  minBet: 10,
  deckCount: 6,
  sabotage: false,
};

export type BlackjackPhase = "betting" | "playing" | "payout";

export type RoundResult = "win" | "lose" | "push" | "blackjack";

// --- Blackjack Sabotage (figure-card powers) ---

/** Target id used to aim a power at the dealer instead of a seat. */
export const BLACKJACK_DEALER_ID = "dealer";
/** A hand's net total modifier is clamped to [-CAP, +CAP]. */
export const BLACKJACK_MODIFIER_CAP = 2;
/** Probability that a figure drawn on a hit is a special "Saboteur" card. */
export const BLACKJACK_PROC_CHANCE = 0.35;
/** Max extra dealer cards a single round can be forced to take (Roi stacking). */
export const BLACKJACK_DEALER_HITS_CAP = 3;

/**
 * Sabotage powers, one per special figure:
 * - "modulate" (Valet): apply ±1 to a hand's total (self / other / dealer).
 * - "graft" (Dame): swap one of your cards with another player's card.
 * - "force" (Roi): force the dealer to take one extra card (collective).
 * - "shield" (As): become immune to others' sabotage for the round.
 */
export type BlackjackPowerKind = "modulate" | "graft" | "force" | "shield";

/** A power being spent by its owner (instant, real-time). */
export type BlackjackPower =
  | { kind: "modulate"; targetId: string; delta: 1 | -1 }
  | { kind: "graft"; targetId: string; myCardIndex: number; targetCardIndex: number }
  | { kind: "force" }
  | { kind: "shield" };

/** A card with an optional "special" flag (a proc'd Valet Saboteur). */
export interface BlackjackCard extends Card {
  special?: boolean;
}

export interface BlackjackPlayerView {
  id: string;
  nickname: string;
  chips: number;
  bet: number | null;
  hand: BlackjackCard[];
  /** False for players who joined mid-round or sat out — they play next round. */
  inRound: boolean;
  hasStood: boolean;
  result: RoundResult | null;
  /** True while this player can still hit/stand (players act in parallel). */
  canAct: boolean;
  /** Net ±total modifier from powers this round (sabotage mode). */
  modifier: number;
  /**
   * A power this player has procced and must spend (or skip) before settling.
   * Only ever set for the viewer themselves — a held power is hidden from others
   * until it is activated.
   */
  pendingPower: BlackjackPowerKind | null;
  /**
   * True while this seat is shielded (As). Hidden from other players until the
   * shield actually blocks an attack — so attackers can't avoid it.
   */
  shielded: boolean;
}

/** Client-facing game state. The dealer's hole card is never included. */
export interface BlackjackView {
  phase: BlackjackPhase;
  round: number;
  players: BlackjackPlayerView[];
  dealerHand: Card[];
  dealerHiddenCard: boolean;
  /** Net ±total modifier applied to the dealer this round (sabotage mode). */
  dealerModifier: number;
  settings: BlackjackSettings;
}
