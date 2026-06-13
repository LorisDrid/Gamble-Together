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

  it("resolves low/high, dozens and columns", () => {
    expect(betWins({ kind: "low", amount: 10 }, 18)).toBe(true);
    expect(betWins({ kind: "low", amount: 10 }, 19)).toBe(false);
    expect(betWins({ kind: "high", amount: 10 }, 19)).toBe(true);
    expect(betWins({ kind: "high", amount: 10 }, 18)).toBe(false);

    expect(betWins({ kind: "dozen", group: 1, amount: 10 }, 12)).toBe(true);
    expect(betWins({ kind: "dozen", group: 2, amount: 10 }, 13)).toBe(true);
    expect(betWins({ kind: "dozen", group: 3, amount: 10 }, 25)).toBe(true);
    expect(betWins({ kind: "dozen", group: 1, amount: 10 }, 13)).toBe(false);

    // Column 1 = 1,4,7,…,34 ; column 2 = 2,5,…,35 ; column 3 = 3,6,…,36
    expect(betWins({ kind: "column", column: 1, amount: 10 }, 34)).toBe(true);
    expect(betWins({ kind: "column", column: 2, amount: 10 }, 35)).toBe(true);
    expect(betWins({ kind: "column", column: 3, amount: 10 }, 36)).toBe(true);
    expect(betWins({ kind: "column", column: 1, amount: 10 }, 2)).toBe(false);
  });

  it("makes zero lose every outside bet", () => {
    for (const bet of [
      { kind: "red" as const, amount: 10 },
      { kind: "black" as const, amount: 10 },
      { kind: "even" as const, amount: 10 },
      { kind: "odd" as const, amount: 10 },
      { kind: "low" as const, amount: 10 },
      { kind: "high" as const, amount: 10 },
      { kind: "dozen" as const, group: 1 as const, amount: 10 },
      { kind: "column" as const, column: 3 as const, amount: 10 },
    ]) {
      expect(betWins(bet, 0)).toBe(false);
    }
  });
});

describe("betPayout", () => {
  it("pays straight 35:1, dozen/column 2:1, even-money 1:1 (stake included)", () => {
    expect(betPayout({ kind: "straight", number: 5, amount: 10 })).toBe(360);
    expect(betPayout({ kind: "dozen", group: 2, amount: 10 })).toBe(30);
    expect(betPayout({ kind: "column", column: 1, amount: 10 })).toBe(30);
    expect(betPayout({ kind: "red", amount: 10 })).toBe(20);
    expect(betPayout({ kind: "low", amount: 10 })).toBe(20);
  });
});
