import { describe, expect, it } from "vitest";

import { PokerGame } from "./game";
import type { PokerSettings } from "./types";

// With rng ~1, the deck stays in creation order and cards are popped from the
// end: spades K, Q, J, 10, 9, 8, 7, 6, 5, 4, 3, 2, A, then clubs K... Dealing
// starts left of the dealer, one card per player per pass.
const rng = () => 0.999999;

const settings: PokerSettings = { startingChips: 1000, smallBlind: 5, bigBlind: 10 };

const player = (id: string, chips?: number) => ({ id, nickname: id.toUpperCase(), chips });

describe("heads-up hand", () => {
  // Dealer is seat 0 (A) and posts the small blind; B posts the big blind.
  // Cards: B gets ♠K ♠J, A gets ♠Q ♠10.

  it("posts blinds and lets the dealer act first preflop", () => {
    const game = new PokerGame([player("a"), player("b")], settings, rng);
    const view = game.getViewFor("a");
    expect(view.phase).toBe("preflop");
    expect(view.pot).toBe(15);
    expect(view.currentPlayerId).toBe("a");
    expect(view.turn).toEqual({
      toCall: 5,
      canCheck: false,
      canRaise: true,
      minRaiseTo: 20,
      maxRaiseTo: 1000,
    });
  });

  it("hides opponents' hole cards but shows mine", () => {
    const game = new PokerGame([player("a"), player("b")], settings, rng);
    const viewA = game.getViewFor("a");
    expect(viewA.players[0]!.holeCards).toEqual([
      { suit: "spades", rank: "Q" },
      { suit: "spades", rank: "10" },
    ]);
    expect(viewA.players[1]!.holeCards).toBeNull();
    expect(viewA.players[1]!.holeCardCount).toBe(2);
  });

  it("plays a checked-down hand to showdown with the right winner", () => {
    const game = new PokerGame([player("a"), player("b")], settings, rng);
    expect(game.call("a")).toEqual({ ok: true });
    expect(game.check("b")).toEqual({ ok: true }); // big blind option closes preflop

    // Postflop the non-dealer acts first; board runs ♠9♠8♠7♠6♠5
    for (const street of ["flop", "turn", "river"]) {
      expect(game.getViewFor("a").phase).toBe(street);
      expect(game.getViewFor("a").currentPlayerId).toBe("b");
      game.check("b");
      game.check("a");
    }

    const view = game.getViewFor("b");
    expect(view.phase).toBe("showdown");
    // Board is a 9-high straight flush; A's ♠Q♠10 makes a 10-high one
    expect(view.winners).toEqual([{ playerId: "a", amount: 20, handName: "Quinte flush" }]);
    expect(view.players[0]!.chips).toBe(1010);
    expect(view.players[1]!.chips).toBe(990);
    // Cards revealed at showdown
    expect(view.players[0]!.holeCards).not.toBeNull();
  });

  it("awards the pot and refunds the uncalled raise when everyone folds", () => {
    const game = new PokerGame([player("a"), player("b")], settings, rng);
    expect(game.raiseTo("a", 30)).toEqual({ ok: true });
    expect(game.fold("b")).toEqual({ ok: true });

    const view = game.getViewFor("a");
    expect(view.phase).toBe("showdown");
    expect(view.winners).toEqual([{ playerId: "a", amount: 20, handName: null }]);
    expect(view.players[0]!.chips).toBe(1010); // won B's big blind
    expect(view.players[1]!.chips).toBe(990);
    expect(view.players[1]!.holeCards).toBeNull(); // nothing revealed on a fold win
  });

  it("enforces turn order and bet legality", () => {
    const game = new PokerGame([player("a"), player("b")], settings, rng);
    expect(game.check("b")).toEqual({ ok: false, error: "NOT_YOUR_TURN" });
    expect(game.check("a")).toEqual({ ok: false, error: "CANNOT_CHECK" });
    expect(game.raiseTo("a", 10)).toEqual({ ok: false, error: "INVALID_RAISE" }); // not above current bet
    expect(game.raiseTo("a", 12)).toEqual({ ok: false, error: "INVALID_RAISE" }); // below min raise
    expect(game.raiseTo("a", 5000)).toEqual({ ok: false, error: "INVALID_RAISE" }); // more than stack
    expect(game.raiseTo("a", 1000)).toEqual({ ok: true }); // all-in is fine
  });

  it("starts the next hand with the button moved", () => {
    const game = new PokerGame([player("a"), player("b")], settings, rng);
    game.raiseTo("a", 30);
    game.fold("b");
    expect(game.nextHand()).toEqual({ ok: true });
    const view = game.getViewFor("a");
    expect(view.phase).toBe("preflop");
    expect(view.handNumber).toBe(2);
    expect(view.players[1]!.isDealer).toBe(true); // button moved to B
    expect(view.currentPlayerId).toBe("b"); // heads-up dealer acts first
  });
});

describe("three-handed all-in with side pots", () => {
  it("splits the pot into levels and pays the best eligible hand per level", () => {
    // A 100 (dealer), B 50 (SB), C 1000 (BB).
    // Cards: B ♠K♠10, C ♠Q♠9, A ♠J♠8; board runs out ♠7♠6♠5♠4♠3.
    // A's ♠8 makes the best straight flush (8-high) -> A wins everything.
    const game = new PokerGame([player("a", 100), player("b", 50), player("c", 1000)], settings, rng);

    expect(game.raiseTo("a", 100)).toEqual({ ok: true }); // all-in
    expect(game.call("b")).toEqual({ ok: true }); // all-in for 50 total
    expect(game.call("c")).toEqual({ ok: true }); // covers, board runs out automatically

    const view = game.getViewFor("a");
    expect(view.phase).toBe("showdown");
    expect(view.community).toHaveLength(5);
    // Main pot 150 (50×3) + side pot 100 (50×2 between A and C)
    expect(view.winners).toEqual([{ playerId: "a", amount: 250, handName: "Quinte flush" }]);
    expect(view.players[0]!.chips).toBe(250);
    expect(view.players[1]!.chips).toBe(0);
    expect(view.players[2]!.chips).toBe(900);
  });

  it("lets a busted player rebuy after the hand", () => {
    const game = new PokerGame([player("a", 100), player("b", 50), player("c", 1000)], settings, rng);
    game.raiseTo("a", 100);
    expect(game.rebuy("b")).toEqual({ ok: false, error: "CANNOT_REBUY" }); // mid-hand
    game.call("b");
    game.call("c");
    expect(game.rebuy("b")).toEqual({ ok: true });
    expect(game.getViewFor("b").players[1]!.chips).toBe(1000);
  });
});

describe("split pots", () => {
  it("splits evenly between tied hands", () => {
    // Four players; A folds. Board runs ♠5♠4♠3♠2♠A: a wheel straight flush
    // that B, C and D all play from the board -> three-way split of 30.
    const game = new PokerGame([player("a"), player("b"), player("c"), player("d")], settings, rng);
    // A is the dealer, B SB, C BB, D acts first
    expect(game.getViewFor("d").currentPlayerId).toBe("d");
    game.call("d");
    game.fold("a");
    game.call("b");
    game.check("c");
    for (let street = 0; street < 3; street++) {
      game.check("b");
      game.check("c");
      game.check("d");
    }

    const view = game.getViewFor("a");
    expect(view.phase).toBe("showdown");
    expect(view.winners).toHaveLength(3);
    expect(view.winners!.every((w) => w.amount === 10 && w.handName === "Quinte flush")).toBe(true);
    expect(view.players.map((p) => p.chips)).toEqual([1000, 1000, 1000, 1000]); // everyone net zero
  });
});

describe("big blind option and reopened action", () => {
  it("gives the big blind the option to raise after callers", () => {
    const game = new PokerGame([player("a"), player("b"), player("c")], settings, rng);
    game.call("a");
    game.call("b");
    // C (big blind) can raise even though everyone has "matched"
    expect(game.raiseTo("c", 40)).toEqual({ ok: true });
    expect(game.getViewFor("a").currentPlayerId).toBe("a");
    expect(game.getViewFor("a").turn?.toCall).toBe(30);
  });
});

describe("table management", () => {
  it("waits when alone and starts once a second player arrives", () => {
    const game = new PokerGame([player("a")], settings, rng);
    expect(game.getViewFor("a").phase).toBe("waiting");
    expect(game.getViewFor("a").canStartHand).toBe(false);
    game.addPlayer("b", "B");
    expect(game.getViewFor("a").canStartHand).toBe(true);
    expect(game.nextHand()).toEqual({ ok: true });
    expect(game.getViewFor("a").phase).toBe("preflop");
  });

  it("folds a player who leaves on their turn and moves on", () => {
    const game = new PokerGame([player("a"), player("b"), player("c")], settings, rng);
    expect(game.getViewFor("a").currentPlayerId).toBe("a");
    game.removePlayer("a");
    const view = game.getViewFor("b");
    expect(view.players).toHaveLength(2);
    expect(view.currentPlayerId).toBe("b");
    // A's seat is gone but the hand goes on between B and C
    game.call("b");
    game.check("c");
    expect(game.getViewFor("b").phase).toBe("flop");
  });

  it("ends the hand when everyone else leaves", () => {
    const game = new PokerGame([player("a"), player("b")], settings, rng);
    game.removePlayer("a");
    const view = game.getViewFor("b");
    expect(view.phase).toBe("showdown");
    expect(view.players[0]!.chips).toBe(1005); // got A's small blind
  });
});
