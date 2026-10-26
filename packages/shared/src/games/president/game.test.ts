import { describe, expect, it } from "vitest";

import { PresidentGame } from "./game";
import type { PresidentCard } from "./types";
import type { Rank, Suit } from "../../deck";

const N = (rank: Rank, suit: Suit = "hearts"): PresidentCard => ({ kind: "normal", suit, rank });

const PLAYERS = ["p0", "p1", "p2"].map((id) => ({ id, nickname: id }));
const TEST_SETTINGS = { startingChips: 1000, ante: 10 };

/**
 * Builds a deck that the round-robin deal hands back to `hands` exactly (each
 * inner array is one player's hand, all the same length). Column k of every hand
 * is laid out in player order, so card (k*P + p) goes to seat p.
 */
function deckFromHands(hands: PresidentCard[][]): PresidentCard[] {
  const length = hands[0]!.length;
  const deck: PresidentCard[] = [];
  for (let k = 0; k < length; k++) for (const hand of hands) deck.push(hand[k]!);
  return deck;
}

function gameWith(hands: PresidentCard[][]): PresidentGame {
  return new PresidentGame(PLAYERS, TEST_SETTINGS, Math.random, deckFromHands(hands));
}

const seatOf = (game: PresidentGame, id: string) =>
  game.getView(id).players.find((p) => p.id === id)!;

describe("president", () => {
  it("deals 52 unique cards, without jokers, sorted in strength order", () => {
    const game = new PresidentGame(PLAYERS, TEST_SETTINGS, () => 0.5);
    const hands = PLAYERS.flatMap(({ id }) => seatOf(game, id).hand!);
    expect(hands).toHaveLength(52);
    expect(hands.every((card) => card.kind === "normal")).toBe(true);
    expect(new Set(hands.map((card) => `${card.rank}-${card.suit}`)).size).toBe(52);
    const sorted = gameWith([
      [N("2", "spades"), N("4", "diamonds"), N("3", "clubs"), N("4")],
      [N("6"), N("7"), N("8"), N("9")],
      [N("10"), N("J"), N("Q"), N("K")],
    ]);
    expect(seatOf(sorted, "p0").hand).toEqual([N("3", "clubs"), N("4"), N("4", "diamonds"), N("2", "spades")]);
  });

  it.each(["4", "2"] as const)("allows equal pairs of %s and clears after all four, without revolution", (rank) => {
    const game = gameWith([
      [N(rank), N(rank, "diamonds"), N("3", "clubs")],
      [N(rank, "clubs"), N(rank, "spades"), N("K")],
      [N("6"), N("7"), N("8")],
    ]);
    expect(game.play("p0", [N(rank), N(rank, "diamonds")])).toEqual({ ok: true });
    expect(game.getView().pile?.sameRankCount).toBe(2);
    expect(game.play("p1", [N(rank, "clubs"), N(rank, "spades")])).toEqual({ ok: true });
    expect(game.getView().pile).toBeNull();
    expect(game.getView().currentPlayerId).toBe("p1");
    expect(game.getView().reversed).toBe(false);
  });

  it("preserves consecutive equal singles across passes and resets passes on closure", () => {
    const game = gameWith([
      [N("4"), N("4", "diamonds"), N("3", "clubs")],
      [N("5"), N("6"), N("7")],
      [N("4", "clubs"), N("4", "spades"), N("8")],
    ]);
    game.play("p0", [N("4")]);
    game.pass("p1");
    expect(game.play("p2", [N("4", "clubs")])).toEqual({ ok: true });
    expect(game.getView().pile?.sameRankCount).toBe(2);
    expect(game.play("p0", [N("4", "diamonds")])).toEqual({ ok: true });
    expect(game.getView().pile?.sameRankCount).toBe(3);
    expect(game.play("p2", [N("4", "spades")])).toEqual({ ok: true });
    expect(game.getView().pile).toBeNull();
    expect(game.getView().currentPlayerId).toBe("p2");
    expect(game.getView().players.every((player) => !player.passed)).toBe(true);
    expect(game.getView().reversed).toBe(false);
  });

  it("starts a new rank count when a higher value interrupts the sequence", () => {
    const game = gameWith([
      [N("4"), N("5", "diamonds"), N("3", "clubs")],
      [N("5"), N("9"), N("10")],
      [N("5", "clubs"), N("6"), N("K")],
    ]);
    game.play("p0", [N("4")]);
    game.play("p1", [N("5")]);
    expect(game.getView().pile?.sameRankCount).toBe(1);
    game.play("p2", [N("5", "clubs")]);
    game.play("p0", [N("5", "diamonds")]);
    expect(game.getView().pile?.sameRankCount).toBe(3);
    expect(game.getView().pile).not.toBeNull();
  });

  it("lets the next active player lead when completing four empties the player's hand", () => {
    const deck = [N("4"), N("4", "clubs"), N("6"), N("4", "diamonds"), N("4", "spades"), N("7"), N("3", "clubs")];
    const game = new PresidentGame(PLAYERS, TEST_SETTINGS, Math.random, deck);
    game.play("p0", [N("4"), N("4", "diamonds")]);
    expect(game.play("p1", [N("4", "clubs"), N("4", "spades")])).toEqual({ ok: true });
    expect(seatOf(game, "p1").rank).toBe(1);
    expect(game.getView().phase).toBe("playing");
    expect(game.getView().pile).toBeNull();
    expect(game.getView().currentPlayerId).toBe("p2");
  });

  it("requires matching counts for 2s and does not clear until others pass", () => {
    const game = gameWith([
      [N("A"), N("A", "clubs"), N("3", "clubs")],
      [N("2"), N("2", "diamonds"), N("4")],
      [N("K"), N("Q"), N("J")],
    ]);
    game.play("p0", [N("A"), N("A", "clubs")]);
    expect(game.play("p1", [N("2")])).toEqual({ ok: false, error: "INVALID_COMBO" });
    expect(game.play("p1", [N("2"), N("2", "diamonds")])).toEqual({ ok: true });
    expect(game.getView().pile?.cards).toEqual([N("2"), N("2", "diamonds")]);
    expect(game.getView().currentPlayerId).toBe("p2");
    game.pass("p2");
    game.pass("p0");
    expect(game.getView().pile).toBeNull();
    expect(game.getView().currentPlayerId).toBe("p1");
  });

  it("does not allow a quad to interrupt a pair", () => {
    const game = gameWith([
      [N("3", "clubs"), N("3"), N("8"), N("9")],
      [N("4"), N("4", "diamonds"), N("4", "clubs"), N("4", "spades")],
      [N("5"), N("6"), N("7"), N("10")],
    ]);
    game.play("p0", [N("3", "clubs"), N("3")]);
    expect(game.play("p1", seatOf(game, "p1").hand!)).toEqual({ ok: false, error: "INVALID_COMBO" });
    expect(game.getView().reversed).toBe(false);
    expect(seatOf(game, "p1").handCount).toBe(4);
  });

  it("allows a player to finish normally with a 2", () => {
    const game = gameWith([[N("3", "clubs")], [N("2")], [N("4")]]);
    game.play("p0", [N("3", "clubs")]);
    expect(game.play("p1", [N("2")])).toEqual({ ok: true });
    expect(game.getView().finishingOrder).toEqual(["p0", "p1", "p2"]);
  });

  it("resets revolution and consecutive counts at the next round", () => {
    const threes = [N("3", "clubs"), N("3"), N("3", "diamonds"), N("3", "spades")];
    const game = gameWith([
      threes,
      [N("4"), N("5"), N("6"), N("7")],
      [N("8"), N("9"), N("10"), N("J")],
    ]);
    expect(game.play("p0", threes)).toEqual({ ok: true });
    expect(game.getView().reversed).toBe(true);
    for (const rank of ["4", "5", "6", "7"] as const) {
      expect(game.play("p1", [N(rank)])).toEqual({ ok: true });
      if (game.getView().phase !== "done") expect(game.pass("p2")).toEqual({ ok: true });
    }
    expect(game.getView().phase).toBe("done");
    expect(game.nextRound()).toEqual({ ok: true });
    expect(game.getView().reversed).toBe(false);
    expect(game.getView().pile).toBeNull();
  });

  it("closes a quad, reverses the whole rank order including 2, and supports counter-revolution", () => {
    const fives = [N("5"), N("5", "diamonds"), N("5", "clubs"), N("5", "spades")];
    const fours = [N("4"), N("4", "diamonds"), N("4", "clubs"), N("4", "spades")];
    const game = gameWith([
      [...fives, N("3", "clubs"), N("2", "spades")],
      [...fours, N("2"), N("K")],
      [N("7"), N("8"), N("9"), N("10"), N("J"), N("Q")],
    ]);
    expect(game.play("p0", fives)).toEqual({ ok: true });
    expect(game.getView().pile).toBeNull();
    expect(game.getView().currentPlayerId).toBe("p0");
    expect(game.getView().reversed).toBe(true);
    expect(seatOf(game, "p0").hand).toEqual([N("2", "spades"), N("3", "clubs")]);
    game.play("p0", [N("3", "clubs")]);
    expect(game.play("p1", [N("2")])).toEqual({ ok: false, error: "CANNOT_BEAT" });
    game.pass("p1");
    game.pass("p2");
    game.play("p0", [N("2", "spades")]); // lowest rank in revolution; finishing on a 2 is legal
    expect(seatOf(game, "p0").finished).toBe(true);
    expect(game.play("p1", [N("K")])).toEqual({ ok: true });
    game.pass("p2");
    expect(game.getView().currentPlayerId).toBe("p1");
    expect(game.play("p1", fours)).toEqual({ ok: true });
    expect(game.getView().reversed).toBe(false);
    expect(game.getView().pile).toBeNull();
    expect(game.getView().currentPlayerId).toBe("p1");
  });

  it("opens with the holder of the 3 of clubs", () => {
    const game = gameWith([
      [N("9"), N("3", "clubs")],
      [N("7"), N("8")],
      [N("10"), N("J")],
    ]);
    expect(game.getView().currentPlayerId).toBe("p0");
    expect(seatOf(game, "p0").handCount).toBe(2);
  });

  it("makes followers beat the pile or pass, and clears the trick to the winner", () => {
    const game = gameWith([
      [N("3", "clubs"), N("5")],
      [N("7"), N("4")],
      [N("9"), N("6")],
    ]);
    expect(game.play("p0", [N("5")])).toEqual({ ok: true }); // p0 leads a 5
    expect(game.play("p1", [N("7")])).toEqual({ ok: true }); // p1 beats it
    expect(game.play("p2", [N("9")])).toEqual({ ok: true }); // p2 beats again
    expect(game.pass("p0")).toEqual({ ok: true });
    expect(game.pass("p1")).toEqual({ ok: true });
    // Everyone else passed → p2 wins the trick, pile cleared, p2 leads
    const view = game.getView();
    expect(view.pile).toBeNull();
    expect(view.currentPlayerId).toBe("p2");
  });

  it("ranks players Président → Trou du cul in finishing order", () => {
    const game = gameWith([[N("3", "clubs")], [N("4")], [N("5")]]);
    expect(game.play("p0", [N("3", "clubs")])).toEqual({ ok: true }); // empties → Président
    expect(game.play("p1", [N("4")])).toEqual({ ok: true }); // empties → Vice; p2 is last
    const view = game.getView();
    expect(view.phase).toBe("done");
    expect(view.finishingOrder).toEqual(["p0", "p1", "p2"]);
    expect(seatOf(game, "p0").rank).toBe(1);
    expect(seatOf(game, "p1").rank).toBe(2);
    expect(seatOf(game, "p2").rank).toBe(3);
  });

  it("rejects illegal actions", () => {
    const game = gameWith([
      [N("3", "clubs"), N("5"), N("6")],
      [N("7"), N("8"), N("9")],
      [N("10"), N("J"), N("Q")],
    ]);
    expect(game.play("p1", [N("7")])).toEqual({ ok: false, error: "NOT_YOUR_TURN" });
    expect(game.pass("p0")).toEqual({ ok: false, error: "CANNOT_PASS_LEAD" });
    expect(game.play("p0", [N("5"), N("6")])).toEqual({ ok: false, error: "INVALID_COMBO" });
    expect(game.play("p0", [N("K", "spades")])).toEqual({ ok: false, error: "NOT_IN_HAND" });
    // The hand is untouched by the failed plays
    expect(seatOf(game, "p0").handCount).toBe(3);
  });

  it("only reveals a player's own hand", () => {
    const game = gameWith([
      [N("3", "clubs"), N("5")],
      [N("7"), N("8")],
      [N("9"), N("10")],
    ]);
    const view = game.getView("p0");
    expect(view.players.find((p) => p.id === "p0")!.hand).toHaveLength(2);
    expect(view.players.find((p) => p.id === "p1")!.hand).toBeNull();
    expect(view.players.find((p) => p.id === "p1")!.handCount).toBe(2);
  });

  it("antes into a pot and pays it out by finishing rank", () => {
    const game = gameWith([[N("3", "clubs")], [N("4")], [N("5")]]);
    game.play("p0", [N("3", "clubs")]); // Président
    game.play("p1", [N("4")]); // Vice; p2 is Trou du cul
    // Pot = 3 × 10 = 30 → Président +20, Vice +10, Trou du cul 0 (net ±ante)
    expect(seatOf(game, "p0").chips).toBe(1010);
    expect(seatOf(game, "p0").lastNet).toBe(10);
    expect(seatOf(game, "p1").chips).toBe(1000);
    expect(seatOf(game, "p1").lastNet).toBe(0);
    expect(seatOf(game, "p2").chips).toBe(990);
    expect(seatOf(game, "p2").lastNet).toBe(-10);
    expect(game.getView().pot).toBe(0);
  });

  it("exchanges cards between rounds: Trou du cul gives its best, Président returns", () => {
    const game = gameWith([
      [N("3", "clubs"), N("K")],
      [N("4"), N("5")],
      [N("6"), N("7")],
    ]);
    // Round 1 → finishing order p0 (Président), p1, p2 (Trou du cul)
    game.play("p0", [N("3", "clubs")]);
    game.play("p1", [N("4")]);
    game.play("p2", [N("6")]);
    game.play("p0", [N("K")]); // p0 empties → Président
    game.pass("p1");
    game.pass("p2");
    game.play("p1", [N("5")]); // p1 empties → Vice; p2 last
    expect(game.getView().finishingOrder).toEqual(["p0", "p1", "p2"]);

    expect(game.nextRound()).toEqual({ ok: true });
    let view = game.getView();
    expect(view.phase).toBe("exchange");
    expect(view.pendingReturns).toEqual([{ fromId: "p0", toId: "p2", count: 2 }]);
    // Trou du cul (p2) auto-gave its 2 best cards (6♥, 7♥) up to the Président (p0)
    expect(seatOf(game, "p0").handCount).toBe(4);
    expect(seatOf(game, "p2").handCount).toBe(0);

    // Wrong count / wrong player are rejected
    expect(game.exchangeReturn("p0", [N("3", "clubs")])).toEqual({ ok: false, error: "WRONG_COUNT" });
    expect(game.exchangeReturn("p1", [N("4")])).toEqual({ ok: false, error: "NO_RETURN_OWED" });

    expect(game.exchangeReturn("p0", [N("3", "clubs"), N("6")])).toEqual({ ok: true });
    view = game.getView();
    expect(view.phase).toBe("playing");
    expect(view.currentPlayerId).toBe("p2"); // the Trou du cul leads the new round
    expect(seatOf(game, "p2").handCount).toBe(2);
    expect(game.getView("p2").players.find((p) => p.id === "p2")!.hand).toEqual([
      N("3", "clubs"),
      N("6"),
    ]);
  });
});
