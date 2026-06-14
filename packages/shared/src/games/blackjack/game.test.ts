import { describe, expect, it } from "vitest";

import { BlackjackGame } from "./game";
import type { BlackjackSettings } from "./types";

// With rng ~1, Fisher-Yates never swaps: the shoe stays in creation order and
// cards are drawn from the end — spades K, Q, J, 10, 9, 8, 7... Deals are
// therefore fully predictable: pass 1 to each player then dealer, pass 2 same.
// Alice K+10=20, Bob Q+9=19, dealer J(up)+8(hole)=18; next draws 7, 6, 5...
const rng = () => 0.999999;

const settings: BlackjackSettings = { startingChips: 1000, minBet: 10, deckCount: 1 };
const twoPlayers = [
  { id: "a", nickname: "Alice" },
  { id: "b", nickname: "Bob" },
];

const seat = (game: BlackjackGame, id: string) =>
  game.getView().players.find((p) => p.id === id)!;

describe("BlackjackGame round flow", () => {
  it("stays in betting until every player who can afford minBet has bet", () => {
    const game = new BlackjackGame(twoPlayers, settings, rng);
    expect(game.placeBet("a", 100)).toEqual({ ok: true });
    expect(game.getView().phase).toBe("betting");
    expect(game.placeBet("b", 50)).toEqual({ ok: true });
    expect(game.getView().phase).toBe("playing");
  });

  it("lets every player act in parallel, then the dealer plays once all are done", () => {
    const game = new BlackjackGame(twoPlayers, settings, rng);
    game.placeBet("a", 100);
    game.placeBet("b", 50);

    // Both players can act from the start — no turn order
    const playing = game.getView();
    expect(playing.dealerHand).toHaveLength(1);
    expect(playing.dealerHiddenCard).toBe(true);
    expect(seat(game, "a").canAct).toBe(true);
    expect(seat(game, "b").canAct).toBe(true);

    // Bob acts first; that must NOT make the dealer play while Alice is still in
    expect(game.stand("b")).toEqual({ ok: true });
    const mid = game.getView();
    expect(mid.phase).toBe("playing");
    expect(mid.dealerHiddenCard).toBe(true); // dealer hasn't drawn yet
    expect(seat(game, "b").canAct).toBe(false);
    expect(seat(game, "a").canAct).toBe(true);

    // Alice finishes -> now the dealer draws and we settle
    expect(game.stand("a")).toEqual({ ok: true });
    const payoutView = game.getView();
    expect(payoutView.phase).toBe("payout");
    expect(payoutView.dealerHiddenCard).toBe(false);
    expect(payoutView.dealerHand).toHaveLength(2); // 18, dealer stands

    expect(seat(game, "a").result).toBe("win"); // 20 vs 18
    expect(seat(game, "a").chips).toBe(1100);
    expect(seat(game, "b").result).toBe("win"); // 19 vs 18
    expect(seat(game, "b").chips).toBe(1050);
  });

  it("lets a busted player finish while the others keep playing", () => {
    const game = new BlackjackGame(twoPlayers, settings, rng);
    game.placeBet("a", 100);
    game.placeBet("b", 50);

    // Alice has 20; the next card (7) busts her to 27
    expect(game.hit("a")).toEqual({ ok: true });
    const mid = game.getView();
    expect(mid.phase).toBe("playing"); // Bob can still act, dealer waits
    expect(seat(game, "a").canAct).toBe(false);
    expect(seat(game, "b").canAct).toBe(true);

    // A busted player can no longer act
    expect(game.hit("a")).toEqual({ ok: false, error: "CANNOT_ACT" });

    game.stand("b");
    expect(seat(game, "a").result).toBe("lose");
    expect(seat(game, "a").chips).toBe(900);
    expect(seat(game, "b").result).toBe("win");
  });

  it("blocks a player who already stood from acting again", () => {
    const game = new BlackjackGame(twoPlayers, settings, rng);
    game.placeBet("a", 100);
    game.placeBet("b", 50);
    game.stand("a");
    expect(game.hit("a")).toEqual({ ok: false, error: "CANNOT_ACT" });
    expect(game.stand("a")).toEqual({ ok: false, error: "CANNOT_ACT" });
    expect(game.stand("b")).toEqual({ ok: true });
  });

  it("resets state for the next round and keeps chips", () => {
    const game = new BlackjackGame(twoPlayers, settings, rng);
    game.placeBet("a", 100);
    game.placeBet("b", 50);
    game.stand("a");
    game.stand("b");

    expect(game.nextRound()).toEqual({ ok: true });
    const view = game.getView();
    expect(view.phase).toBe("betting");
    expect(view.round).toBe(2);
    expect(view.players[0]!.chips).toBe(1100);
    expect(view.players[0]!.bet).toBeNull();
    expect(view.players[0]!.hand).toHaveLength(0);
    expect(view.players[0]!.result).toBeNull();
    expect(view.dealerHand).toHaveLength(0);
  });

  it("validates bets", () => {
    const game = new BlackjackGame(twoPlayers, settings, rng);
    expect(game.placeBet("a", 5)).toEqual({ ok: false, error: "INVALID_BET" }); // below minBet
    expect(game.placeBet("a", 1001)).toEqual({ ok: false, error: "INVALID_BET" }); // above chips
    expect(game.placeBet("a", 10.5)).toEqual({ ok: false, error: "INVALID_BET" });
    expect(game.placeBet("x", 100)).toEqual({ ok: false, error: "UNKNOWN_PLAYER" });
    expect(game.placeBet("a", 100)).toEqual({ ok: true });
    expect(game.placeBet("a", 100)).toEqual({ ok: false, error: "ALREADY_BET" });
  });

  it("rejects actions in the wrong phase", () => {
    const game = new BlackjackGame(twoPlayers, settings, rng);
    expect(game.hit("a")).toEqual({ ok: false, error: "WRONG_PHASE" });
    expect(game.nextRound()).toEqual({ ok: false, error: "WRONG_PHASE" });
    expect(game.rebuy("a")).toEqual({ ok: false, error: "CANNOT_REBUY" }); // not broke
  });

  it("lets a late joiner play from the next round", () => {
    const game = new BlackjackGame(twoPlayers, settings, rng);
    game.placeBet("a", 100);
    game.placeBet("b", 50);
    game.addPlayer("c", "Carol");

    expect(game.getView().players).toHaveLength(3);
    expect(game.getView().players[2]!.inRound).toBe(false);

    game.stand("a");
    game.stand("b");
    game.nextRound();
    expect(game.placeBet("c", 20)).toEqual({ ok: true });
  });

  it("settles when the last still-acting player leaves", () => {
    const game = new BlackjackGame(twoPlayers, settings, rng);
    game.placeBet("a", 100);
    game.placeBet("b", 50);
    game.stand("a");
    expect(game.getView().phase).toBe("playing"); // Bob still to act

    game.removePlayer("b");
    expect(game.getView().phase).toBe("payout"); // nobody left to act -> dealer plays
    expect(seat(game, "a").result).toBe("win");
  });

  it("setMinBet raises the table minimum (tournament escalation)", () => {
    const game = new BlackjackGame(twoPlayers, settings, rng);
    game.setMinBet(200);
    expect(game.getView().settings.minBet).toBe(200);
    expect(game.placeBet("a", 100)).toEqual({ ok: false, error: "INVALID_BET" });
    expect(game.placeBet("a", 200)).toEqual({ ok: true });
  });

  it("deals as soon as the last player still expected to bet leaves", () => {
    const game = new BlackjackGame(twoPlayers, settings, rng);
    game.placeBet("a", 100);
    game.removePlayer("b");
    expect(game.getView().phase).toBe("playing");
  });
});
