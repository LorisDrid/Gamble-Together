import { describe, expect, it } from "vitest";

import { baccaratValue, handTotal, resolveCoup } from "./rules";
import type { Card, Rank, Suit } from "../../deck";

const c = (rank: Rank, suit: Suit = "hearts"): Card => ({ rank, suit });

describe("baccarat rules", () => {
  it("scores cards: ace 1, figures/10 = 0, totals mod 10", () => {
    expect(baccaratValue(c("A"))).toBe(1);
    expect(baccaratValue(c("9"))).toBe(9);
    expect(baccaratValue(c("10"))).toBe(0);
    expect(baccaratValue(c("K"))).toBe(0);
    // 7 + 8 = 15 → 5
    expect(handTotal([c("7"), c("8")])).toBe(5);
    expect(handTotal([c("K"), c("4")])).toBe(4);
  });

  it("stands both hands on a natural and resolves immediately", () => {
    // Player 4+5 = 9 (natural) beats Banker 3+4 = 7
    const coup = resolveCoup([c("4"), c("3"), c("5"), c("4")]);
    expect(coup.playerHand).toHaveLength(2);
    expect(coup.bankerHand).toHaveLength(2);
    expect(coup.outcome).toBe("player");
  });

  it("ties when both hands match", () => {
    // Player 3+5 = 8, Banker 6+2 = 8
    expect(resolveCoup([c("3"), c("6"), c("5"), c("2")]).outcome).toBe("tie");
  });

  it("draws a Player third card on 0–5 and stands the Banker on 7", () => {
    // Player 2+3 = 5 draws (→ +4 = 9); Banker K+7 = 7 stands
    const coup = resolveCoup([c("2"), c("K"), c("3"), c("7"), c("4")]);
    expect(coup.playerHand).toHaveLength(3);
    expect(coup.bankerHand).toHaveLength(2);
    expect(coup.outcome).toBe("player");
  });

  it("stands the Player on 6–7 and draws the Banker on ≤5", () => {
    // Player 10+7 = 7 stands; Banker 2+3 = 5 draws (→ +K = 5)
    const coup = resolveCoup([c("10"), c("2"), c("7"), c("3"), c("K")]);
    expect(coup.playerHand).toHaveLength(2);
    expect(coup.bankerHand).toHaveLength(3);
    expect(coup.outcome).toBe("player"); // 7 vs 5
  });

  it("applies the Banker third-card table against the Player's third card", () => {
    // Banker on 3 stands when the Player's third card is an 8.
    // Player 2+3 = 5 draws an 8 (→ 3); Banker A+2 = 3 stands → tie
    const stand = resolveCoup([c("2"), c("A"), c("3"), c("2"), c("8")]);
    expect(stand.bankerHand).toHaveLength(2);
    expect(stand.outcome).toBe("tie");

    // Banker on 2 always draws when the Player drew.
    // Player 2+2 = 4 draws a 3 (→ 7); Banker A+A = 2 draws a 9 (→ 1) → player
    const draw = resolveCoup([c("2"), c("A"), c("2"), c("A"), c("3"), c("9")]);
    expect(draw.bankerHand).toHaveLength(3);
    expect(draw.outcome).toBe("player");
  });
});
