import { describe, expect, it } from "vitest";

import { dealerShouldHit, handValue, isBlackjack, isBust, payout, roundResult } from "./hands";
import type { Card, Rank } from "../../deck";

const c = (rank: Rank): Card => ({ rank, suit: "spades" });

describe("handValue", () => {
  it("counts number and face cards", () => {
    expect(handValue([c("7"), c("8")])).toEqual({ total: 15, soft: false });
    expect(handValue([c("K"), c("Q")])).toEqual({ total: 20, soft: false });
  });

  it("counts aces as 11 while it does not bust", () => {
    expect(handValue([c("A"), c("K")])).toEqual({ total: 21, soft: true });
    expect(handValue([c("A"), c("A")])).toEqual({ total: 12, soft: true });
    expect(handValue([c("A"), c("9"), c("5")])).toEqual({ total: 15, soft: false });
    expect(handValue([c("A"), c("A"), c("9")])).toEqual({ total: 21, soft: true });
  });
});

describe("hand predicates", () => {
  it("detects blackjack only on two-card 21", () => {
    expect(isBlackjack([c("A"), c("K")])).toBe(true);
    expect(isBlackjack([c("7"), c("7"), c("7")])).toBe(false);
  });

  it("detects bust", () => {
    expect(isBust([c("K"), c("Q"), c("5")])).toBe(true);
    expect(isBust([c("K"), c("Q")])).toBe(false);
  });

  it("dealer hits below 17 and stands on all 17s", () => {
    expect(dealerShouldHit([c("K"), c("6")])).toBe(true);
    expect(dealerShouldHit([c("K"), c("7")])).toBe(false);
    expect(dealerShouldHit([c("A"), c("6")])).toBe(false); // soft 17
  });
});

describe("roundResult", () => {
  const twenty = [c("K"), c("Q")];
  const nineteen = [c("K"), c("9")];
  const natural = [c("A"), c("K")];
  const bust = [c("K"), c("Q"), c("5")];

  it("player bust always loses, even if dealer busts", () => {
    expect(roundResult(bust, bust)).toBe("lose");
  });

  it("naturals beat a regular 21 and push against each other", () => {
    expect(roundResult(natural, [c("7"), c("7"), c("7")])).toBe("blackjack");
    expect(roundResult(natural, natural)).toBe("push");
    expect(roundResult(twenty, natural)).toBe("lose");
  });

  it("compares totals when nobody busts", () => {
    expect(roundResult(twenty, nineteen)).toBe("win");
    expect(roundResult(nineteen, twenty)).toBe("lose");
    expect(roundResult(twenty, twenty)).toBe("push");
    expect(roundResult(nineteen, bust)).toBe("win");
  });
});

describe("sabotage modifiers", () => {
  const twenty = [c("K"), c("Q")];
  const nineteen = [c("K"), c("9")];
  const natural = [c("A"), c("K")];

  it("shifts the bust threshold", () => {
    expect(isBust([c("K"), c("Q"), c("2")])).toBe(true); // 22
    expect(isBust([c("K"), c("Q"), c("2")], -1)).toBe(false); // 22 → 21 saved
    expect(isBust(twenty, 2)).toBe(true); // 20 → 22 busted
    expect(isBust(twenty, 1)).toBe(false); // 20 → 21
  });

  it("shifts the dealer's hit threshold", () => {
    expect(dealerShouldHit([c("K"), c("6")], 1)).toBe(false); // 16 → 17, stands
    expect(dealerShouldHit([c("K"), c("7")], -1)).toBe(true); // 17 → 16, hits
  });

  it("compares effective totals at settlement", () => {
    expect(roundResult(nineteen, twenty, 2)).toBe("win"); // 21 vs 20
    expect(roundResult(twenty, nineteen, -2)).toBe("lose"); // 18 vs 19
    expect(roundResult(twenty, twenty, 0, -1)).toBe("win"); // 20 vs 19 (poked dealer)
  });

  it("a tampered hand loses its natural status", () => {
    expect(roundResult(natural, twenty)).toBe("blackjack"); // untouched natural
    expect(roundResult(natural, twenty, -1)).toBe("push"); // 20 vs 20, no 3:2
    expect(roundResult(natural, twenty, 1)).toBe("lose"); // 22, busted natural
  });
});

describe("payout", () => {
  it("returns stake plus winnings", () => {
    expect(payout(100, "win")).toBe(200);
    expect(payout(100, "push")).toBe(100);
    expect(payout(100, "lose")).toBe(0);
    expect(payout(100, "blackjack")).toBe(250);
  });

  it("rounds blackjack 3:2 down on odd bets", () => {
    expect(payout(15, "blackjack")).toBe(37);
  });
});
