import { describe, expect, it } from "vitest";

import { isWellFormed } from "./socketGuard";

const ack = () => {};

describe("incoming message guard", () => {
  it("accepts every event with its callback in the expected place", () => {
    expect(isWellFormed("blackjack:hit", [ack])).toBe(true);
    expect(isWellFormed("poker:raise", [200, ack])).toBe(true);
    expect(isWellFormed("liarsdice:bid", [3, 4, ack])).toBe(true);
    expect(isWellFormed("room:join", [{ code: "ABCD", nickname: "x" }, ack])).toBe(true);
  });

  it("accepts events that take no callback", () => {
    expect(isWellFormed("room:leave", [])).toBe(true);
    expect(isWellFormed("game:end", [])).toBe(true);
  });

  it("drops a message whose callback is missing", () => {
    expect(isWellFormed("blackjack:hit", [])).toBe(false);
    expect(isWellFormed("room:create", [{ nickname: "x" }])).toBe(false);
    expect(isWellFormed("profile:sync", [{ token: "abcdefgh" }])).toBe(false);
  });

  it("drops a message whose callback is misplaced or not a function", () => {
    expect(isWellFormed("poker:raise", [ack])).toBe(false); // amount missing
    expect(isWellFormed("liarsdice:bid", [3, ack])).toBe(false);
    expect(isWellFormed("poker:raise", [200, ack, "extra"])).toBe(false);
    expect(isWellFormed("blackjack:hit", ["not a function"])).toBe(false);
  });

  it("drops unknown events, including inherited property names", () => {
    expect(isWellFormed("nope", [ack])).toBe(false);
    expect(isWellFormed("constructor", [ack])).toBe(false);
    expect(isWellFormed("__proto__", [ack])).toBe(false);
    expect(isWellFormed(42, [ack])).toBe(false);
  });
});
