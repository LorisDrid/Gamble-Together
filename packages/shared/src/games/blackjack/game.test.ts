import { describe, expect, it } from "vitest";

import { BlackjackGame } from "./game";
import type { BlackjackSettings } from "./types";

// With rng ~1, Fisher-Yates never swaps: the shoe stays in creation order and
// cards are drawn from the end — spades K, Q, J, 10, 9, 8, 7... Deals are
// therefore fully predictable: pass 1 to each player then dealer, pass 2 same.
const rng = () => 0.999999;

const settings: BlackjackSettings = { startingChips: 1000, minBet: 10, deckCount: 1 };
const twoPlayers = [
  { id: "a", nickname: "Alice" },
  { id: "b", nickname: "Bob" },
];

describe("BlackjackGame round flow", () => {
  it("stays in betting until every player who can afford minBet has bet", () => {
    const game = new BlackjackGame(twoPlayers, settings, rng);
    expect(game.placeBet("a", 100)).toEqual({ ok: true });
    expect(game.getView().phase).toBe("betting");
    expect(game.placeBet("b", 50)).toEqual({ ok: true });
    expect(game.getView().phase).toBe("playing");
  });

  it("plays a full round: deal, turns, dealer, payouts", () => {
    const game = new BlackjackGame(twoPlayers, settings, rng);
    game.placeBet("a", 100);
    game.placeBet("b", 50);

    // Deterministic deal: Alice K+10=20, Bob Q+9=19, dealer J+8=18
    const playing = game.getView();
    expect(playing.currentPlayerId).toBe("a");
    expect(playing.dealerHand).toHaveLength(1);
    expect(playing.dealerHiddenCard).toBe(true);

    expect(game.hit("b")).toEqual({ ok: false, error: "NOT_YOUR_TURN" });
    expect(game.stand("a")).toEqual({ ok: true });
    expect(game.stand("b")).toEqual({ ok: true });

    const payoutView = game.getView();
    expect(payoutView.phase).toBe("payout");
    expect(payoutView.dealerHiddenCard).toBe(false);
    expect(payoutView.dealerHand).toHaveLength(2); // 18, dealer stands

    const [alice, bob] = payoutView.players;
    expect(alice!.result).toBe("win"); // 20 vs 18
    expect(alice!.chips).toBe(1100);
    expect(bob!.result).toBe("win"); // 19 vs 18
    expect(bob!.chips).toBe(1050);
  });

  it("busts a player who hits too much and moves on", () => {
    const game = new BlackjackGame(twoPlayers, settings, rng);
    game.placeBet("a", 100);
    game.placeBet("b", 50);

    // Alice has K+10=20; the next card busts her
    expect(game.hit("a")).toEqual({ ok: true });
    const view = game.getView();
    expect(view.currentPlayerId).toBe("b");

    game.stand("b");
    const final = game.getView();
    expect(final.players[0]!.result).toBe("lose");
    expect(final.players[0]!.chips).toBe(900);
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

  it("advances the turn when the current player leaves", () => {
    const game = new BlackjackGame(twoPlayers, settings, rng);
    game.placeBet("a", 100);
    game.placeBet("b", 50);
    expect(game.getView().currentPlayerId).toBe("a");

    game.removePlayer("a");
    expect(game.getView().currentPlayerId).toBe("b");

    game.stand("b");
    expect(game.getView().phase).toBe("payout");
  });

  it("deals as soon as the last player still expected to bet leaves", () => {
    const game = new BlackjackGame(twoPlayers, settings, rng);
    game.placeBet("a", 100);
    game.removePlayer("b");
    expect(game.getView().phase).toBe("playing");
  });
});
