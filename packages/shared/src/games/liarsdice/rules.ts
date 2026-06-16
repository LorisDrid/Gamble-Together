import type { LiarsDiceBid } from "./types";

/**
 * Counts how many dice match `face` across all dice. 1s are wild — they count
 * toward any face — EXCEPT when the bid is on 1s, where only actual 1s count.
 */
export function tally(allDice: readonly number[], face: number): number {
  return allDice.filter((die) => die === face || (face !== 1 && die === 1)).length;
}

/** Validates a bid's shape (whole numbers, quantity ≥ 1, face 1–6). */
export function isValidBid(bid: LiarsDiceBid): boolean {
  return (
    Number.isInteger(bid.quantity) &&
    Number.isInteger(bid.face) &&
    bid.quantity >= 1 &&
    bid.face >= 1 &&
    bid.face <= 6
  );
}

/**
 * Whether `next` legally raises `prev` (Perudo rules with wild 1s):
 * - opening bid (no prev): any valid bid.
 * - both normal faces: higher quantity, or same quantity + higher face.
 * - switching TO aces (1s): quantity ≥ ⌈prev/2⌉ (aces are worth ~double).
 * - switching FROM aces to a normal face: quantity ≥ 2·prev + 1.
 * - aces to aces: higher quantity.
 */
export function bidBeats(prev: LiarsDiceBid | null, next: LiarsDiceBid): boolean {
  if (!isValidBid(next)) return false;
  if (prev === null) return true;

  const prevAce = prev.face === 1;
  const nextAce = next.face === 1;

  if (!prevAce && !nextAce) {
    return next.quantity > prev.quantity || (next.quantity === prev.quantity && next.face > prev.face);
  }
  if (!prevAce && nextAce) {
    return next.quantity >= Math.ceil(prev.quantity / 2);
  }
  if (prevAce && !nextAce) {
    return next.quantity >= 2 * prev.quantity + 1;
  }
  return next.quantity > prev.quantity; // aces → aces
}
