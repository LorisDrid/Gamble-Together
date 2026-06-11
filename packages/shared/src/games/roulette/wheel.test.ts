import { describe, expect, it } from "vitest";

import { betPayout, betWins, numberColor, spinWheel } from "./wheel";

describe("numberColor", () => {
  it("maps zero to green and numbers to casino colors", () => {
    expect(numberColor(0)).toBe("green");
    expect(numberColor(18)).toBe("red");
    expect(numberColor(17)).toBe("black");
    expect(numberColor(32)).toBe("red");
    expect(numberColor(26)).toBe("black");
  });
});

describe("spinWheel", () => {
  it("covers the full 0-36 range", () => {
    expect(spinWheel(() => 0)).toBe(0);
    expect(spinWheel(() => 0.999999)).toBe(36);
    expect(spinWheel(() => 18.5 / 37)).toBe(18);
  });
});

describe("betWins", () => {
  it("resolves straight bets", () => {
    expect(betWins({ kind: "straight", number: 18, amount: 10 }, 18)).toBe(true);
    expect(betWins({ kind: "straight", number: 17, amount: 10 }, 18)).toBe(false);
    expect(betWins({ kind: "straight", number: 0, amount: 10 }, 0)).toBe(true);
  });

  it("resolves color and parity bets", () => {
    expect(betWins({ kind: "red", amount: 10 }, 18)).toBe(true);
    expect(betWins({ kind: "black", amount: 10 }, 18)).toBe(false);
    expect(betWins({ kind: "even", amount: 10 }, 18)).toBe(true);
    expect(betWins({ kind: "odd", amount: 10 }, 17)).toBe(true);
  });

  it("makes zero lose every outside bet", () => {
    expect(betWins({ kind: "red", amount: 10 }, 0)).toBe(false);
    expect(betWins({ kind: "black", amount: 10 }, 0)).toBe(false);
    expect(betWins({ kind: "even", amount: 10 }, 0)).toBe(false);
    expect(betWins({ kind: "odd", amount: 10 }, 0)).toBe(false);
  });
});

describe("betPayout", () => {
  it("pays straight 35:1 and outside bets 1:1, stake included", () => {
    expect(betPayout({ kind: "straight", number: 5, amount: 10 })).toBe(360);
    expect(betPayout({ kind: "red", amount: 10 })).toBe(20);
  });
});
