import { describe, expect, it } from "vitest";

import { LiarsDiceGame } from "./game";
import type { Rng } from "../../random";

/** An rng that yields the given die faces in order (then 6s). */
function dieRng(faces: number[]): Rng {
  let i = 0;
  return () => ((faces[i++] ?? 6) - 0.5) / 6;
}

function gameWith(faces: number[], diceCount: number, ids = ["p0", "p1"]): LiarsDiceGame {
  return new LiarsDiceGame(
    ids.map((id) => ({ id, nickname: id })),
    { startingChips: 1000, ante: 100, diceCount },
    dieRng(faces),
  );
}

const seatOf = (game: LiarsDiceGame, id: string) =>
  game.getView(id).players.find((p) => p.id === id)!;

describe("liar's dice game", () => {
  it("deals private dice and antes into a pot", () => {
    const game = gameWith([2, 2, 3, 4], 2); // p0=[2,2], p1=[3,4]
    const view = game.getView("p0");
    expect(view.pot).toBe(200); // 2 × 100
    expect(view.players.find((p) => p.id === "p0")!.dice).toEqual([2, 2]);
    expect(view.players.find((p) => p.id === "p1")!.dice).toBeNull(); // hidden
    expect(view.players.find((p) => p.id === "p1")!.diceCount).toBe(2);
  });

  it("makes the challenger lose a die when the bid holds", () => {
    const game = gameWith([2, 2, 3, 4], 2);
    expect(game.bid("p0", 2, 2)).toEqual({ ok: true }); // "two 2s" — true (exactly two)
    expect(game.challenge("p1")).toEqual({ ok: true });
    const view = game.getView();
    expect(view.phase).toBe("reveal");
    expect(view.reveal).toMatchObject({ actual: 2, loserId: "p1", bidderId: "p0" });
    expect(seatOf(game, "p1").diceCount).toBe(1);
    expect(seatOf(game, "p0").dice).toEqual([2, 2]); // all dice revealed
  });

  it("makes the bidder lose a die when the bid is a lie", () => {
    const game = gameWith([2, 2, 3, 4], 2);
    game.bid("p0", 3, 2); // "three 2s" — only two exist
    game.challenge("p1");
    expect(game.getView().reveal).toMatchObject({ actual: 2, loserId: "p0" });
    expect(seatOf(game, "p0").diceCount).toBe(1);
  });

  it("counts 1s as wild in the showdown", () => {
    const game = gameWith([1, 2, 2, 4], 2); // p0=[1,2], p1=[2,4]
    game.bid("p0", 3, 2); // two 2s + one wild 1 = 3 → true
    game.challenge("p1");
    expect(game.getView().reveal).toMatchObject({ actual: 3, loserId: "p1" });
  });

  it("eliminates a player and pays the pot to the winner", () => {
    const game = gameWith([2, 3], 1); // p0=[2], p1=[3], one die each
    game.bid("p0", 1, 2); // one 2 — true
    game.challenge("p1"); // challenger loses their only die → out
    const view = game.getView();
    expect(view.phase).toBe("done");
    expect(view.winnerId).toBe("p0");
    expect(seatOf(game, "p0").chips).toBe(1100); // 1000 − 100 ante + 200 pot
    expect(seatOf(game, "p0").lastNet).toBe(100);
    expect(seatOf(game, "p1").lastNet).toBe(-100);
  });

  it("starts the next round with the loser opening and fresh rolls", () => {
    // initial p0=[2,2] p1=[3,4]; round 2 re-roll p0=[5,5] p1=[6]
    const game = gameWith([2, 2, 3, 4, 5, 5, 6], 2);
    game.bid("p0", 2, 2);
    game.challenge("p1"); // p1 loses a die (down to 1)
    expect(game.nextRound()).toEqual({ ok: true });
    const view = game.getView();
    expect(view.phase).toBe("bidding");
    expect(view.round).toBe(2);
    expect(view.currentPlayerId).toBe("p1"); // the loser opens
    expect(view.currentBid).toBeNull();
    expect(seatOf(game, "p1").dice).toEqual([6]); // re-rolled, one die left
  });

  it("rejects illegal actions", () => {
    const game = gameWith([2, 2, 3, 4], 2);
    expect(game.bid("p1", 1, 2)).toEqual({ ok: false, error: "NOT_YOUR_TURN" });
    expect(game.challenge("p0")).toEqual({ ok: false, error: "NO_BID" }); // nothing to challenge
    expect(game.bid("p0", 1, 7)).toEqual({ ok: false, error: "INVALID_BID" });
    game.bid("p0", 2, 3);
    expect(game.bid("p1", 1, 3)).toEqual({ ok: false, error: "INVALID_BID" }); // doesn't raise
  });
});
