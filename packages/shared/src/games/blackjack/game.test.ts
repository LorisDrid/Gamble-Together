import { describe, expect, it } from "vitest";

import { BlackjackGame } from "./game";
import { handValue } from "./hands";
import { BLACKJACK_DEALER_ID, type BlackjackSettings } from "./types";

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

const seat = (game: BlackjackGame, id: string, viewer?: string) =>
  game.getView(viewer).players.find((p) => p.id === id)!;

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

describe("Blackjack Sabotage (Valet ±1 power)", () => {
  const fivePlayers = ["p0", "p1", "p2", "p3", "p4"].map((id) => ({ id, nickname: id }));

  /**
   * rng that keeps the shoe in creation order (no Fisher-Yates swaps), so the
   * pop order is spades K..A, then clubs K..A. Draws use pop (no rng), so the
   * only post-construction rng call is the proc roll on a drawn Jack — which the
   * test arms on demand.
   */
  function orderedDeckRng() {
    let armed: number | null = null;
    const fn = () => {
      if (armed !== null) {
        const value = armed;
        armed = null;
        return value;
      }
      return 0.999999;
    };
    return { fn, arm: (value: number) => (armed = value) };
  }

  /**
   * Drives the table to the point where p4 has procced a Valet Saboteur (a ±1
   * power), still in "playing". After the deal p0=17 p1=16 p2=15 p3=14 p4=12;
   * the post-deal draws are spades A, clubs K, clubs Q, clubs J in hit order, so
   * routing the clubs Jack to p4 (12 → 22) procs the power while p0 & p3 are
   * still acting (round stays open).
   */
  function procScenario(sabotage = true) {
    const { fn, arm } = orderedDeckRng();
    const game = new BlackjackGame(
      fivePlayers,
      { startingChips: 1000, minBet: 10, deckCount: 1, sabotage },
      fn,
    );
    for (const player of fivePlayers) game.placeBet(player.id, 10);
    game.hit("p0"); // spades A → soft 18 (still acting)
    game.hit("p1"); // clubs K → 26 bust
    game.hit("p2"); // clubs Q → 25 bust
    arm(0.1); // 0.1 < 0.35 → the next Valet drawn is special
    game.hit("p4"); // clubs J → 22, procs the power
    return game;
  }

  it("turns a Valet drawn on a hit into a special power; non-Valets don't proc", () => {
    const game = procScenario();
    const mine = seat(game, "p4", "p4");
    expect(mine.pendingPower).toBe("modulate");
    expect(mine.hand.find((card) => card.special)).toEqual({
      rank: "J",
      suit: "clubs",
      special: true,
    });
    // p1/p2 drew K/Q on their hits — no power (p0 drew the Ace; checked elsewhere)
    for (const id of ["p1", "p2"]) expect(seat(game, id, id).pendingPower).toBeNull();
    // A pending power keeps the round open even though nobody else can act
    expect(game.getView().phase).toBe("playing");
  });

  it("keeps a held special card hidden from others until it's used", () => {
    const game = procScenario();
    // Another player sees neither p4's pending power nor the special mark
    const asSeen = () => seat(game, "p4", "p0");
    expect(asSeen().pendingPower).toBeNull();
    expect(asSeen().hand.some((card) => card.special)).toBe(false);

    // Using the Valet reveals it to everyone
    game.usePower("p4", { kind: "modulate", targetId: "p0", delta: 1 });
    expect(asSeen().hand.find((card) => card.special)).toMatchObject({ rank: "J" });
  });

  it("does not proc when sabotage mode is off", () => {
    const game = procScenario(false);
    const p4 = seat(game, "p4", "p4");
    expect(p4.pendingPower).toBeNull();
    expect(p4.hand.some((card) => card.special)).toBe(false);
  });

  it("self −1 saves a busted hand (clutch)", () => {
    const game = procScenario();
    expect(game.usePower("p4", { kind: "modulate", targetId: "p4", delta: -1 })).toEqual({
      ok: true,
    });
    expect(seat(game, "p4").modifier).toBe(-1);

    game.stand("p0");
    game.stand("p3");
    expect(game.getView().phase).toBe("payout");
    // p4 22 → 21 beats the dealer's 20 instead of busting
    expect(seat(game, "p4").result).toBe("win");
    expect(seat(game, "p4").chips).toBe(1010);
  });

  it("can sabotage another seat or the dealer", () => {
    const seatTarget = procScenario();
    expect(seatTarget.usePower("p4", { kind: "modulate", targetId: "p0", delta: 1 })).toEqual({
      ok: true,
    });
    expect(seat(seatTarget, "p0").modifier).toBe(1);

    const dealerTarget = procScenario();
    expect(
      dealerTarget.usePower("p4", { kind: "modulate", targetId: BLACKJACK_DEALER_ID, delta: -1 }),
    ).toEqual({ ok: true });
    expect(dealerTarget.getView().dealerModifier).toBe(-1);
  });

  it("validates power usage (no power, bad target) and lets you skip", () => {
    const game = procScenario();
    expect(game.usePower("p0", { kind: "modulate", targetId: "p0", delta: 1 })).toEqual({
      ok: false,
      error: "NO_POWER",
    });
    expect(game.usePower("p4", { kind: "modulate", targetId: "ghost", delta: 1 })).toEqual({
      ok: false,
      error: "INVALID_TARGET",
    });
    // Power is untouched by the failed calls, so it can still be skipped
    expect(game.skipPower("p4")).toEqual({ ok: true });
    expect(seat(game, "p4", "p4").pendingPower).toBeNull();
  });

  it("clears modifiers, powers and special marks on the next round", () => {
    const game = procScenario();
    game.usePower("p4", { kind: "modulate", targetId: BLACKJACK_DEALER_ID, delta: 1 });
    game.stand("p0");
    game.stand("p3");
    expect(game.getView().phase).toBe("payout");

    expect(game.nextRound()).toEqual({ ok: true });
    const view = game.getView();
    expect(view.dealerModifier).toBe(0);
    for (const player of view.players) {
      expect(player.modifier).toBe(0);
      expect(player.pendingPower).toBeNull();
      expect(player.hand.every((card) => !card.special)).toBe(true);
    }
  });

  /**
   * Like procScenario, but the spades Ace (p0's first hit) procs the shield for
   * p0, while the clubs Jack still procs the ±1 for p4 — so a Valet attack can
   * be pitted against a shield.
   */
  function shieldScenario() {
    const { fn, arm } = orderedDeckRng();
    const game = new BlackjackGame(
      fivePlayers,
      { startingChips: 1000, minBet: 10, deckCount: 1, sabotage: true },
      fn,
    );
    for (const player of fivePlayers) game.placeBet(player.id, 10);
    arm(0.1);
    game.hit("p0"); // spades A → shield procs for p0
    game.usePower("p0", { kind: "shield" }); // activate it (secretly)
    game.hit("p1"); // clubs K → 26 bust
    game.hit("p2"); // clubs Q → 25 bust
    arm(0.1);
    game.hit("p4"); // clubs J → ±1 procs for p4
    return game;
  }

  it("activates a shield that stays hidden from others until it blocks", () => {
    const game = shieldScenario();
    expect(seat(game, "p0", "p0").shielded).toBe(true); // owner sees their shield
    expect(seat(game, "p0", "p1").shielded).toBe(false); // hidden from others
  });

  it("blocks an attack on a shielded player and reveals the shield", () => {
    const game = shieldScenario();
    // p4 tries to poke p0; the shield absorbs it (the attacker's power is spent)
    expect(game.usePower("p4", { kind: "modulate", targetId: "p0", delta: 1 })).toEqual({
      ok: true,
    });
    expect(seat(game, "p0", "p1").modifier).toBe(0); // no modifier applied
    expect(seat(game, "p0", "p1").shielded).toBe(true); // shield now revealed to all
    expect(seat(game, "p4", "p4").pendingPower).toBeNull(); // power consumed
  });

  /**
   * Drives the table so p2 procs a Dame Saboteur (graft). The clubs Queen is the
   * card p2 draws on its hit. After: p2 = sJ, s5, cQ (25, bust); p3 = s10, s4 (14).
   */
  function graftScenario() {
    const { fn, arm } = orderedDeckRng();
    const game = new BlackjackGame(
      fivePlayers,
      { startingChips: 1000, minBet: 10, deckCount: 1, sabotage: true },
      fn,
    );
    for (const player of fivePlayers) game.placeBet(player.id, 10);
    game.hit("p0"); // spades A → soft 18, still acting
    game.hit("p1"); // clubs K → 26 bust
    arm(0.1);
    game.hit("p2"); // clubs Q → 25, procs the graft for p2
    return game;
  }

  it("turns a Dame drawn on a hit into a graft power", () => {
    const game = graftScenario();
    const mine = seat(game, "p2", "p2");
    expect(mine.pendingPower).toBe("graft");
    expect(mine.hand.find((card) => card.special)).toMatchObject({ rank: "Q", suit: "clubs" });
  });

  it("swaps a card with another player, which can un-bust a hand", () => {
    const game = graftScenario();
    // p2 (bust at 25) trades its spades J for p3's spades 4
    expect(
      game.usePower("p2", { kind: "graft", targetId: "p3", myCardIndex: 0, targetCardIndex: 1 }),
    ).toEqual({ ok: true });

    const p2 = seat(game, "p2", "p2");
    const p3 = seat(game, "p3", "p3");
    expect(p2.hand[0]).toMatchObject({ rank: "4", suit: "spades" });
    expect(p3.hand[1]).toMatchObject({ rank: "J", suit: "spades" });
    expect(handValue(p2.hand).total).toBe(19); // 4 + 5 + 10, no longer bust
    expect(handValue(p3.hand).total).toBe(20); // 10 + 10
  });

  it("won't graft the special Dame itself, and rejects bad targets", () => {
    const game = graftScenario();
    // The procced Dame (index 2) is the power source — it can't be swapped away
    expect(
      game.usePower("p2", { kind: "graft", targetId: "p3", myCardIndex: 2, targetCardIndex: 0 }),
    ).toEqual({ ok: false, error: "INVALID_POWER" });
    // Out-of-range card index
    expect(
      game.usePower("p2", { kind: "graft", targetId: "p3", myCardIndex: 9, targetCardIndex: 0 }),
    ).toEqual({ ok: false, error: "INVALID_POWER" });
    // Unknown target and self-target are invalid
    expect(
      game.usePower("p2", { kind: "graft", targetId: "ghost", myCardIndex: 0, targetCardIndex: 0 }),
    ).toEqual({ ok: false, error: "INVALID_TARGET" });
    expect(
      game.usePower("p2", { kind: "graft", targetId: "p2", myCardIndex: 0, targetCardIndex: 0 }),
    ).toEqual({ ok: false, error: "INVALID_TARGET" });
    // None of the failed calls consumed the power
    expect(seat(game, "p2", "p2").pendingPower).toBe("graft");
  });

  it("lets a shield block a graft and reveal itself", () => {
    const { fn, arm } = orderedDeckRng();
    const game = new BlackjackGame(
      fivePlayers,
      { startingChips: 1000, minBet: 10, deckCount: 1, sabotage: true },
      fn,
    );
    for (const player of fivePlayers) game.placeBet(player.id, 10);
    arm(0.1);
    game.hit("p0"); // spades A → shield procs for p0
    game.usePower("p0", { kind: "shield" });
    game.hit("p1"); // clubs K → bust
    arm(0.1);
    game.hit("p2"); // clubs Q → graft procs for p2

    expect(
      game.usePower("p2", { kind: "graft", targetId: "p0", myCardIndex: 0, targetCardIndex: 0 }),
    ).toEqual({ ok: true });
    // p0's hand is untouched, the shield is now revealed, and p2's power is spent
    expect(seat(game, "p0", "p0").hand[0]).toMatchObject({ rank: "K", suit: "spades" });
    expect(seat(game, "p2", "p2").hand[0]).toMatchObject({ rank: "J", suit: "spades" });
    expect(seat(game, "p0", "p1").shielded).toBe(true);
    expect(seat(game, "p2", "p2").pendingPower).toBeNull();
  });
});
