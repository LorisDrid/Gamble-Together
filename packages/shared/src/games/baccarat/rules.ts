import type { Card } from "../../deck";
import type { BaccaratOutcome } from "./types";

/** Baccarat card value: Ace = 1, 2–9 face value, 10 & figures = 0. */
export function baccaratValue(card: Card): number {
  if (card.rank === "A") return 1;
  if (card.rank === "10" || card.rank === "J" || card.rank === "Q" || card.rank === "K") return 0;
  return Number(card.rank);
}

/** A hand's baccarat total: the units digit of the sum (e.g. 7 + 8 = 15 → 5). */
export function handTotal(cards: readonly Card[]): number {
  return cards.reduce((sum, card) => sum + baccaratValue(card), 0) % 10;
}

export interface Coup {
  playerHand: Card[];
  bankerHand: Card[];
  outcome: BaccaratOutcome;
}

/**
 * Deals a Punto Banco coup from the front of `shoe` and resolves it with the
 * fixed third-card rules (no decisions — pure house procedure). Dealing order is
 * Player, Banker, Player, Banker, then any third cards (Player first).
 */
export function resolveCoup(shoe: readonly Card[]): Coup {
  const player: Card[] = [shoe[0]!, shoe[2]!];
  const banker: Card[] = [shoe[1]!, shoe[3]!];
  let next = 4;

  const playerTotal = handTotal(player);
  const bankerTotal = handTotal(banker);
  const natural = playerTotal >= 8 || bankerTotal >= 8;

  let playerThird: number | null = null;
  if (!natural) {
    // Player draws on 0–5, stands on 6–7.
    if (playerTotal <= 5) {
      const card = shoe[next++]!;
      player.push(card);
      playerThird = baccaratValue(card);
    }
    if (bankerDraws(bankerTotal, playerThird)) {
      banker.push(shoe[next++]!);
    }
  }

  const finalPlayer = handTotal(player);
  const finalBanker = handTotal(banker);
  const outcome: BaccaratOutcome =
    finalPlayer > finalBanker ? "player" : finalBanker > finalPlayer ? "banker" : "tie";
  return { playerHand: player, bankerHand: banker, outcome };
}

/**
 * The Banker's third-card rule. When the Player stood (no third card) the Banker
 * simply draws on 0–5; otherwise it depends on the Player's third-card value.
 */
function bankerDraws(bankerTotal: number, playerThird: number | null): boolean {
  if (playerThird === null) return bankerTotal <= 5;
  switch (bankerTotal) {
    case 0:
    case 1:
    case 2:
      return true;
    case 3:
      return playerThird !== 8;
    case 4:
      return playerThird >= 2 && playerThird <= 7;
    case 5:
      return playerThird >= 4 && playerThird <= 7;
    case 6:
      return playerThird === 6 || playerThird === 7;
    default:
      return false; // 7 stands
  }
}
