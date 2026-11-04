import { describe, expect, it } from "vitest";

import { bidBeats, isValidBid, smallestRaise, tally } from "./rules";

describe("smallest raise", () => {
  it("opens on one die showing 2", () => {
    expect(smallestRaise(null)).toEqual({ quantity: 1, face: 2 });
  });

  it("goes up a face, then adds a die", () => {
    expect(smallestRaise({ quantity: 3, face: 4 })).toEqual({ quantity: 3, face: 5 });
    expect(smallestRaise({ quantity: 3, face: 6 })).toEqual({ quantity: 4, face: 2 });
    expect(smallestRaise({ quantity: 3, face: 1 })).toEqual({ quantity: 4, face: 1 });
  });

  it("is always a legal raise", () => {
    for (let quantity = 1; quantity <= 12; quantity++) {
      for (let face = 1; face <= 6; face++) {
        const prev = { quantity, face };
        expect(bidBeats(prev, smallestRaise(prev))).toBe(true);
      }
    }
  });
});

describe("liar's dice rules", () => {
  it("tallies a face, counting 1s as wild (except when betting on 1s)", () => {
    const dice = [2, 1, 3, 1, 2];
    expect(tally(dice, 2)).toBe(4); // two 2s + two wild 1s
    expect(tally(dice, 3)).toBe(3); // one 3 + two wild 1s
    expect(tally(dice, 1)).toBe(2); // only actual 1s, no wild for themselves
  });

  it("rejects malformed bids", () => {
    expect(isValidBid({ quantity: 0, face: 3 })).toBe(false);
    expect(isValidBid({ quantity: 2, face: 7 })).toBe(false);
    expect(isValidBid({ quantity: 2.5, face: 3 })).toBe(false);
    expect(isValidBid({ quantity: 2, face: 3 })).toBe(true);
  });

  it("allows any valid opening bid", () => {
    expect(bidBeats(null, { quantity: 1, face: 2 })).toBe(true);
    expect(bidBeats(null, { quantity: 3, face: 1 })).toBe(true);
    expect(bidBeats(null, { quantity: 0, face: 2 })).toBe(false);
  });

  it("raises a normal bid by quantity or by face", () => {
    const prev = { quantity: 3, face: 4 };
    expect(bidBeats(prev, { quantity: 3, face: 5 })).toBe(true); // same qty, higher face
    expect(bidBeats(prev, { quantity: 4, face: 2 })).toBe(true); // higher qty
    expect(bidBeats(prev, { quantity: 3, face: 4 })).toBe(false); // identical
    expect(bidBeats(prev, { quantity: 3, face: 3 })).toBe(false); // lower face
    expect(bidBeats(prev, { quantity: 2, face: 6 })).toBe(false); // lower qty
  });

  it("applies the ace-switch rules", () => {
    // To aces: quantity ≥ ⌈prev/2⌉
    expect(bidBeats({ quantity: 4, face: 5 }, { quantity: 2, face: 1 })).toBe(true);
    expect(bidBeats({ quantity: 4, face: 5 }, { quantity: 1, face: 1 })).toBe(false);
    // From aces to a normal face: quantity ≥ 2·prev + 1
    expect(bidBeats({ quantity: 2, face: 1 }, { quantity: 5, face: 3 })).toBe(true);
    expect(bidBeats({ quantity: 2, face: 1 }, { quantity: 4, face: 3 })).toBe(false);
    // Aces to aces: higher quantity
    expect(bidBeats({ quantity: 2, face: 1 }, { quantity: 3, face: 1 })).toBe(true);
    expect(bidBeats({ quantity: 2, face: 1 }, { quantity: 2, face: 1 })).toBe(false);
  });
});
