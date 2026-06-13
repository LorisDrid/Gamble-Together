import type { Rng } from "../../random";
import { ROULETTE_MAX_NUMBER, type RouletteBet } from "./types";

export const RED_NUMBERS: ReadonlySet<number> = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export type RouletteColor = "red" | "black" | "green";

export function numberColor(n: number): RouletteColor {
  if (n === 0) return "green";
  return RED_NUMBERS.has(n) ? "red" : "black";
}

export function spinWheel(rng: Rng): number {
  return Math.floor(rng() * (ROULETTE_MAX_NUMBER + 1));
}

/** The dozen (1-3) a number belongs to, or 0 for the green zero. */
export function dozenOf(n: number): number {
  return n === 0 ? 0 : Math.ceil(n / 12);
}

/** The column (1-3) a number belongs to, or 0 for the green zero. */
export function columnOf(n: number): number {
  if (n === 0) return 0;
  return n % 3 === 0 ? 3 : n % 3;
}

/** Zero loses every outside bet — that's the house edge. */
export function betWins(bet: RouletteBet, winning: number): boolean {
  switch (bet.kind) {
    case "straight":
      return bet.number === winning;
    case "red":
      return numberColor(winning) === "red";
    case "black":
      return numberColor(winning) === "black";
    case "even":
      return winning !== 0 && winning % 2 === 0;
    case "odd":
      return winning % 2 === 1;
    case "low":
      return winning >= 1 && winning <= 18;
    case "high":
      return winning >= 19 && winning <= 36;
    case "dozen":
      return dozenOf(winning) === bet.group;
    case "column":
      return columnOf(winning) === bet.column;
  }
}

/** Total returned for a winning bet, stake included: straight 35:1, dozen/column 2:1, even-money 1:1. */
export function betPayout(bet: RouletteBet): number {
  if (bet.kind === "straight") return bet.amount * 36;
  if (bet.kind === "dozen" || bet.kind === "column") return bet.amount * 3;
  return bet.amount * 2;
}
