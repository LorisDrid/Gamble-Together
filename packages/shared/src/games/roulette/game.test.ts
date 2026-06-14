import { describe, expect, it } from "vitest";

import { RouletteGame } from "./game";
import type { RouletteSettings } from "./types";

/** Rng that makes the wheel land exactly on `n`. */
const landOn = (n: number) => () => (n + 0.5) / 37;

const settings: RouletteSettings = { startingChips: 1000, minBet: 10 };
const twoPlayers = [
  { id: "a", nickname: "Alice" },
  { id: "b", nickname: "Bob" },
];

describe("RouletteGame round flow", () => {
  it("spins only when every player has validated", () => {
    const game = new RouletteGame(twoPlayers, settings, landOn(18));
    game.placeBet("a", { kind: "red", amount: 100 });
    expect(game.setReady("a")).toEqual({ ok: true });
    expect(game.getView().phase).toBe("betting");
    expect(game.setReady("b")).toEqual({ ok: true });
    expect(game.getView().phase).toBe("result");
    expect(game.getView().winningNumber).toBe(18);
  });

  it("settles multiple bets per player, stake deducted at bet time", () => {
    const game = new RouletteGame(twoPlayers, settings, landOn(18)); // 18 = red, even
    game.placeBet("a", { kind: "red", amount: 100 });
    game.placeBet("a", { kind: "straight", number: 18, amount: 10 });
    game.placeBet("b", { kind: "black", amount: 50 });
    expect(game.getView().players[0]!.chips).toBe(890);

    game.setReady("a");
    game.setReady("b");

    const [alice, bob] = game.getView().players;
    // Alice: red wins 200, straight wins 360 -> 890 + 560
    expect(alice!.chips).toBe(1450);
    expect(alice!.lastNet).toBe(450);
    // Bob: black loses
    expect(bob!.chips).toBe(950);
    expect(bob!.lastNet).toBe(-50);
  });

  it("zero makes all outside bets lose", () => {
    const game = new RouletteGame(twoPlayers, settings, landOn(0));
    game.placeBet("a", { kind: "red", amount: 100 });
    game.placeBet("b", { kind: "even", amount: 100 });
    game.setReady("a");
    game.setReady("b");
    const view = game.getView();
    expect(view.players[0]!.lastNet).toBe(-100);
    expect(view.players[1]!.lastNet).toBe(-100);
  });

  it("validating without bets passes the round", () => {
    const game = new RouletteGame(twoPlayers, settings, landOn(5));
    game.placeBet("a", { kind: "odd", amount: 100 });
    game.setReady("a");
    game.setReady("b"); // Bob passes
    expect(game.getView().players[1]!.lastNet).toBe(0);
    expect(game.getView().players[0]!.lastNet).toBe(100);
  });

  it("clears and refunds pending bets", () => {
    const game = new RouletteGame(twoPlayers, settings, landOn(5));
    game.placeBet("a", { kind: "red", amount: 100 });
    game.placeBet("a", { kind: "odd", amount: 200 });
    expect(game.getView().players[0]!.chips).toBe(700);
    expect(game.clearBets("a")).toEqual({ ok: true });
    expect(game.getView().players[0]!.chips).toBe(1000);
    expect(game.getView().players[0]!.bets).toHaveLength(0);
  });

  it("locks bets once validated", () => {
    const game = new RouletteGame(twoPlayers, settings, landOn(5));
    game.setReady("a");
    expect(game.placeBet("a", { kind: "red", amount: 10 })).toEqual({
      ok: false,
      error: "ALREADY_READY",
    });
    expect(game.clearBets("a")).toEqual({ ok: false, error: "ALREADY_READY" });
    expect(game.setReady("a")).toEqual({ ok: false, error: "ALREADY_READY" });
  });

  it("validates bets", () => {
    const game = new RouletteGame(twoPlayers, settings, landOn(5));
    expect(game.placeBet("a", { kind: "red", amount: 5 })).toEqual({ ok: false, error: "INVALID_BET" });
    expect(game.placeBet("a", { kind: "red", amount: 1001 })).toEqual({ ok: false, error: "INVALID_BET" });
    expect(game.placeBet("a", { kind: "straight", number: 37, amount: 10 })).toEqual({
      ok: false,
      error: "INVALID_BET",
    });
    expect(game.placeBet("a", { kind: "straight", number: 2.5, amount: 10 })).toEqual({
      ok: false,
      error: "INVALID_BET",
    });
    expect(game.placeBet("x", { kind: "red", amount: 10 })).toEqual({
      ok: false,
      error: "UNKNOWN_PLAYER",
    });
    // @ts-expect-error invalid dozen group must be rejected
    expect(game.placeBet("a", { kind: "dozen", group: 4, amount: 10 })).toEqual({
      ok: false,
      error: "INVALID_BET",
    });
  });

  it("settles dozen and column bets at 2:1", () => {
    const game = new RouletteGame(twoPlayers, settings, landOn(34)); // 34: dozen 3, column 1, black, even, high
    game.placeBet("a", { kind: "dozen", group: 3, amount: 100 }); // wins 300
    game.placeBet("a", { kind: "column", column: 1, amount: 100 }); // wins 300
    game.placeBet("b", { kind: "dozen", group: 1, amount: 100 }); // loses
    game.setReady("a");
    game.setReady("b");

    const [alice, bob] = game.getView().players;
    expect(alice!.lastNet).toBe(400); // staked 200, returned 600
    expect(alice!.chips).toBe(1400);
    expect(bob!.lastNet).toBe(-100);
  });

  it("resets for the next round but keeps chips and last result", () => {
    const game = new RouletteGame(twoPlayers, settings, landOn(18));
    game.placeBet("a", { kind: "red", amount: 100 });
    game.setReady("a");
    game.setReady("b");
    expect(game.nextRound()).toEqual({ ok: true });

    const view = game.getView();
    expect(view.phase).toBe("betting");
    expect(view.round).toBe(2);
    expect(view.winningNumber).toBeNull();
    expect(view.players[0]!.chips).toBe(1100);
    expect(view.players[0]!.bets).toHaveLength(0);
    expect(view.players[0]!.ready).toBe(false);
    expect(view.players[0]!.lastNet).toBe(100); // kept as info until next spin
  });

  it("setMinBet raises the minimum and lets the wheel spin without broke players", () => {
    const game = new RouletteGame(twoPlayers, { startingChips: 100, minBet: 10 }, landOn(0));
    game.placeBet("a", { kind: "red", amount: 100 }); // all-in; 0 is green → loses
    game.setReady("a");
    game.setReady("b");
    expect(game.getView().players.find((p) => p.id === "a")!.chips).toBe(0);

    game.nextRound();
    game.setMinBet(50);
    expect(game.getView().settings.minBet).toBe(50);
    // Alice (0 chips) can't meet the minimum; Bob alone validating must still spin
    game.placeBet("b", { kind: "red", amount: 50 });
    game.setReady("b");
    expect(game.getView().phase).toBe("result");
  });

  it("spins when the last non-ready player leaves", () => {
    const game = new RouletteGame(twoPlayers, settings, landOn(5));
    game.placeBet("a", { kind: "odd", amount: 50 });
    game.setReady("a");
    game.removePlayer("b");
    expect(game.getView().phase).toBe("result");
  });

  it("allows rebuy only when broke with no pending bets", () => {
    const game = new RouletteGame(twoPlayers, settings, landOn(5));
    expect(game.rebuy("a")).toEqual({ ok: false, error: "CANNOT_REBUY" });
    game.placeBet("a", { kind: "black", amount: 1000 }); // all-in, 5 is odd+red -> loses
    game.setReady("a");
    game.setReady("b");
    game.nextRound();
    expect(game.getView().players[0]!.chips).toBe(0);
    expect(game.rebuy("a")).toEqual({ ok: true });
    expect(game.getView().players[0]!.chips).toBe(1000);
  });
});
