import type { Card } from "../../deck";
import type { RoundResult } from "./types";

export interface HandValue {
  total: number;
  /** True when an ace is still counted as 11. */
  soft: boolean;
}

export function handValue(hand: readonly Card[]): HandValue {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    if (card.rank === "A") {
      aces++;
      total += 11;
    } else if (card.rank === "K" || card.rank === "Q" || card.rank === "J" || card.rank === "10") {
      total += 10;
    } else {
      total += Number(card.rank);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export function isBust(hand: readonly Card[]): boolean {
  return handValue(hand).total > 21;
}

/** A natural: 21 with the first two cards. */
export function isBlackjack(hand: readonly Card[]): boolean {
  return hand.length === 2 && handValue(hand).total === 21;
}

/** Dealer stands on all 17s (including soft 17). */
export function dealerShouldHit(hand: readonly Card[]): boolean {
  return handValue(hand).total < 17;
}

export function roundResult(playerHand: readonly Card[], dealerHand: readonly Card[]): RoundResult {
  if (isBust(playerHand)) return "lose";
  const playerNatural = isBlackjack(playerHand);
  const dealerNatural = isBlackjack(dealerHand);
  if (playerNatural && dealerNatural) return "push";
  if (playerNatural) return "blackjack";
  if (dealerNatural) return "lose";
  const player = handValue(playerHand).total;
  const dealer = handValue(dealerHand).total;
  if (dealer > 21 || player > dealer) return "win";
  if (player < dealer) return "lose";
  return "push";
}

/** Total returned to the player, stake included. Blackjack pays 3:2, rounded down. */
export function payout(bet: number, result: RoundResult): number {
  switch (result) {
    case "blackjack":
      return bet + Math.floor(bet * 1.5);
    case "win":
      return bet * 2;
    case "push":
      return bet;
    case "lose":
      return 0;
  }
}
