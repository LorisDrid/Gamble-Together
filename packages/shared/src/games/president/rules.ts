import { SUITS, type Rank } from "../../deck";
import { PRESIDENT_NORMAL_ORDER, type PresidentCard } from "./types";

export function presidentRankStrength(rank: Rank, reversed = false): number {
  const index = PRESIDENT_NORMAL_ORDER.indexOf(rank);
  return reversed ? PRESIDENT_NORMAL_ORDER.length - 1 - index : index;
}

/** Sort a copy from weakest to strongest; suits only break ties for display. */
export function sortPresidentHand(cards: readonly PresidentCard[], reversed = false): PresidentCard[] {
  return [...cards].sort((a, b) =>
    presidentRankStrength(a.rank, reversed) - presidentRankStrength(b.rank, reversed) ||
    SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit),
  );
}

/** Same validation for the action button and the authoritative game. */
export function canPlayPresidentCards(
  cards: readonly PresidentCard[],
  pile: { cards: readonly PresidentCard[]; count: number } | null,
  reversed = false,
): boolean {
  const first = cards[0];
  if (!first || cards.length > 4 || !cards.every((card) =>
    card.kind === "normal" && card.rank === first.rank && PRESIDENT_NORMAL_ORDER.includes(card.rank),
  )) return false;
  if (!pile) return true;
  const previous = pile.cards[0];
  return !!previous && cards.length === pile.count &&
    presidentRankStrength(first.rank, reversed) >= presidentRankStrength(previous.rank, reversed);
}
