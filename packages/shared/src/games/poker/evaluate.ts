import type { Card, Rank, Suit } from "../../deck";

/** Index doubles as the category strength, ascending. */
export const HAND_CATEGORIES = [
  "high-card",
  "pair",
  "two-pair",
  "three-of-a-kind",
  "straight",
  "flush",
  "full-house",
  "four-of-a-kind",
  "straight-flush",
] as const;

export type HandCategory = (typeof HAND_CATEGORIES)[number];

export const HAND_NAMES_FR: Record<HandCategory, string> = {
  "high-card": "Carte haute",
  pair: "Paire",
  "two-pair": "Double paire",
  "three-of-a-kind": "Brelan",
  straight: "Quinte",
  flush: "Couleur",
  "full-house": "Full",
  "four-of-a-kind": "Carré",
  "straight-flush": "Quinte flush",
};

export interface HandScore {
  category: number;
  categoryName: HandCategory;
  /** Compared lexicographically after the category. */
  tiebreak: number[];
}

const RANK_VALUE: Record<Rank, number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

/** Best high card of a 5-long run in `values` (sorted desc, unique), or null. Handles the wheel (A-5). */
function findStraightHigh(values: number[]): number | null {
  const withWheelAce = values.includes(14) ? [...values, 1] : values;
  let runLength = 1;
  for (let i = 1; i < withWheelAce.length; i++) {
    if (withWheelAce[i]! === withWheelAce[i - 1]! - 1) {
      runLength++;
      if (runLength >= 5) return withWheelAce[i]! + 4;
    } else {
      runLength = 1;
    }
  }
  return null;
}

/**
 * Evaluates the best 5-card poker hand out of 5 to 7 cards.
 * Scores compare by category first, then tiebreak lexicographically.
 */
export function evaluateHand(cards: readonly Card[]): HandScore {
  const values = cards.map((card) => RANK_VALUE[card.rank]).sort((a, b) => b - a);
  const uniqueValues = [...new Set(values)];

  const bySuit = new Map<Suit, number[]>();
  for (const card of cards) {
    const list = bySuit.get(card.suit) ?? [];
    list.push(RANK_VALUE[card.rank]);
    bySuit.set(card.suit, list);
  }
  let flushValues: number[] | null = null;
  for (const list of bySuit.values()) {
    if (list.length >= 5) flushValues = list.sort((a, b) => b - a);
  }

  if (flushValues) {
    const straightFlushHigh = findStraightHigh([...new Set(flushValues)]);
    if (straightFlushHigh !== null) return score("straight-flush", [straightFlushHigh]);
  }

  const countByValue = new Map<number, number>();
  for (const value of values) countByValue.set(value, (countByValue.get(value) ?? 0) + 1);
  // Highest count first, then highest value
  const groups = [...countByValue.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const ofAKind = (n: number) => groups.filter(([, count]) => count >= n).map(([value]) => value);

  const quads = ofAKind(4);
  if (quads.length > 0) {
    const kicker = uniqueValues.find((value) => value !== quads[0])!;
    return score("four-of-a-kind", [quads[0]!, kicker]);
  }

  const trips = groups.filter(([, count]) => count === 3).map(([value]) => value);
  const pairs = groups.filter(([, count]) => count === 2).map(([value]) => value);
  if (trips.length > 0 && (pairs.length > 0 || trips.length > 1)) {
    const pairPart = Math.max(pairs[0] ?? 0, trips[1] ?? 0);
    return score("full-house", [trips[0]!, pairPart]);
  }

  if (flushValues) return score("flush", flushValues.slice(0, 5));

  const straightHigh = findStraightHigh(uniqueValues);
  if (straightHigh !== null) return score("straight", [straightHigh]);

  if (trips.length > 0) {
    const kickers = uniqueValues.filter((value) => value !== trips[0]).slice(0, 2);
    return score("three-of-a-kind", [trips[0]!, ...kickers]);
  }

  if (pairs.length >= 2) {
    const kicker = uniqueValues.find((value) => value !== pairs[0] && value !== pairs[1])!;
    return score("two-pair", [pairs[0]!, pairs[1]!, kicker]);
  }

  if (pairs.length === 1) {
    const kickers = uniqueValues.filter((value) => value !== pairs[0]).slice(0, 3);
    return score("pair", [pairs[0]!, ...kickers]);
  }

  return score("high-card", uniqueValues.slice(0, 5));
}

/** Positive when a beats b, negative when b beats a, 0 on a tie. */
export function compareHands(a: HandScore, b: HandScore): number {
  if (a.category !== b.category) return a.category - b.category;
  const length = Math.max(a.tiebreak.length, b.tiebreak.length);
  for (let i = 0; i < length; i++) {
    const diff = (a.tiebreak[i] ?? 0) - (b.tiebreak[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function score(categoryName: HandCategory, tiebreak: number[]): HandScore {
  return { category: HAND_CATEGORIES.indexOf(categoryName), categoryName, tiebreak };
}
