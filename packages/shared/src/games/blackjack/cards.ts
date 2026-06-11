import type { Card, Rank, Suit } from "./types";

export const SUITS: readonly Suit[] = ["hearts", "diamonds", "clubs", "spades"];
export const RANKS: readonly Rank[] = [
  "A",
  "2",
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
];

/** Returns a float in [0, 1). Injected so game logic stays deterministic in tests. */
export type Rng = () => number;

export function createShoe(deckCount: number): Card[] {
  const cards: Card[] = [];
  for (let deck = 0; deck < deckCount; deck++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ suit, rank });
      }
    }
  }
  return cards;
}

/** Fisher-Yates, returns a new array. */
export function shuffle(cards: readonly Card[], rng: Rng): Card[] {
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = result[i]!;
    result[i] = result[j]!;
    result[j] = a;
  }
  return result;
}
