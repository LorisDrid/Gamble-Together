import { describe, expect, it } from "vitest";

import { BaccaratGame } from "./game";
import type { BaccaratSettings } from "./types";
import type { Card, Rank, Suit } from "../../deck";

const c = (rank: Rank, suit: Suit = "hearts"): Card => ({ rank, suit });
const SETTINGS: BaccaratSettings = { startingChips: 1000, minBet: 10, deckCount: 1 };
const PLAYERS = [
  { id: "p1", nickname: "p1" },
  { id: "p2", nickname: "p2" },
];

// Fixed shoes that resolve to a known outcome (dealing order P,B,P,B,…).
const PLAYER_WIN = [c("4"), c("3"), c("5"), c("4")]; // 9 vs 7
const BANKER_WIN = [c("10"), c("6"), c("7"), c("2")]; // 7 vs 8 (natural)
const TIE = [c("3"), c("6"), c("5"), c("2")]; // 8 vs 8

function gameWith(shoe: Card[]): BaccaratGame {
  return new BaccaratGame(PLAYERS, SETTINGS, Math.random, shoe);
}

const seatOf = (game: BaccaratGame, id: string) =>
  game.getView().players.find((p) => p.id === id)!;

describe("baccarat game", () => {
  it("settles a Player win at 1:1", () => {
    const game = gameWith(PLAYER_WIN);
    game.placeBet("p1", { kind: "player", amount: 100 });
    game.placeBet("p2", { kind: "banker", amount: 50 });
    game.placeBet("p2", { kind: "tie", amount: 10 });
    game.setReady("p1");
    game.setReady("p2");

    const view = game.getView();
    expect(view.phase).toBe("result");
    expect(view.outcome).toBe("player");
    expect(seatOf(game, "p1").chips).toBe(1100); // +100
    expect(seatOf(game, "p1").lastNet).toBe(100);
    expect(seatOf(game, "p2").chips).toBe(940); // -60 (banker + tie both lose)
    expect(seatOf(game, "p2").lastNet).toBe(-60);
  });

  it("settles a Banker win minus the 5% commission", () => {
    const game = gameWith(BANKER_WIN);
    game.placeBet("p1", { kind: "banker", amount: 100 });
    game.setReady("p1");
    game.setReady("p2"); // p2 passes

    expect(game.getView().outcome).toBe("banker");
    // 100 stake back + 95 winnings (100 × 0.95)
    expect(seatOf(game, "p1").chips).toBe(1095);
    expect(seatOf(game, "p1").lastNet).toBe(95);
    expect(seatOf(game, "p2").lastNet).toBe(0); // passed
  });

  it("pays a Tie 8:1 and pushes Player/Banker bets", () => {
    const game = gameWith(TIE);
    game.placeBet("p1", { kind: "player", amount: 100 }); // pushes
    game.placeBet("p1", { kind: "tie", amount: 10 }); // wins 8:1
    game.setReady("p1");
    game.setReady("p2");

    expect(game.getView().outcome).toBe("tie");
    // player bet returned (100) + tie bet returns 90 → net +80
    expect(seatOf(game, "p1").chips).toBe(1080);
    expect(seatOf(game, "p1").lastNet).toBe(80);
  });

  it("validates bets", () => {
    const game = gameWith(PLAYER_WIN);
    expect(game.placeBet("p1", { kind: "x" as never, amount: 50 })).toEqual({
      ok: false,
      error: "INVALID_BET",
    });
    expect(game.placeBet("p1", { kind: "player", amount: 5 })).toEqual({
      ok: false,
      error: "INVALID_BET",
    }); // below minBet
    expect(game.placeBet("p1", { kind: "player", amount: 2000 })).toEqual({
      ok: false,
      error: "INVALID_BET",
    }); // above chips
    expect(game.placeBet("p1", { kind: "player", amount: 10.5 })).toEqual({
      ok: false,
      error: "INVALID_BET",
    });
    expect(game.placeBet("ghost", { kind: "player", amount: 50 })).toEqual({
      ok: false,
      error: "UNKNOWN_PLAYER",
    });
    // Locked bets can't be changed
    game.setReady("p1");
    expect(game.placeBet("p1", { kind: "player", amount: 50 })).toEqual({
      ok: false,
      error: "ALREADY_READY",
    });
  });

  it("refunds pending bets on clear, and resets on the next round", () => {
    const game = gameWith(PLAYER_WIN);
    game.placeBet("p1", { kind: "player", amount: 100 });
    expect(seatOf(game, "p1").chips).toBe(900);
    game.clearBets("p1");
    expect(seatOf(game, "p1").chips).toBe(1000);
    expect(seatOf(game, "p1").bets).toHaveLength(0);

    // Play a round, then start the next one
    game.placeBet("p1", { kind: "player", amount: 100 });
    game.setReady("p1");
    game.setReady("p2");
    expect(game.getView().phase).toBe("result");
    expect(game.nextRound()).toEqual({ ok: true });
    const view = game.getView();
    expect(view.phase).toBe("betting");
    expect(view.outcome).toBeNull();
    expect(view.playerHand).toHaveLength(0);
    expect(view.players.every((p) => p.bets.length === 0 && !p.ready)).toBe(true);
  });
});
