import { describe, expect, it } from "vitest";

import { PresidentGame } from "./game";
import type { PresidentCard } from "./types";
import type { Rank, Suit } from "../../deck";

const N = (rank: Rank, suit: Suit = "hearts"): PresidentCard => ({ kind: "normal", suit, rank });
const JK = (id: 0 | 1): PresidentCard => ({ kind: "joker", id });

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

  it("treats a 2 as a bomb that clears the pile and re-leads", () => {
    const game = gameWith([
      [N("3", "clubs"), N("5")],
      [N("2"), N("4")],
      [N("9"), N("6")],
    ]);
    game.play("p0", [N("5")]);
    expect(game.play("p1", [N("2")])).toEqual({ ok: true });
    const view = game.getView();
    expect(view.pile).toBeNull(); // bomb cleared the table
    expect(view.currentPlayerId).toBe("p1"); // and its player leads again
  });

  it("reverses the order on a quad (révolution), so a lower quad beats a higher one", () => {
    const game = gameWith([
      [N("3", "clubs"), N("5"), N("5", "diamonds"), N("5", "clubs"), N("5", "spades")],
      [N("4"), N("4", "diamonds"), N("4", "clubs"), N("4", "spades"), N("6")],
      [N("7"), N("8"), N("9"), N("10"), N("J")],
    ]);
    const fives = [N("5"), N("5", "diamonds"), N("5", "clubs"), N("5", "spades")];
    const fours = [N("4"), N("4", "diamonds"), N("4", "clubs"), N("4", "spades")];
    expect(game.play("p0", fives)).toEqual({ ok: true });
    expect(game.getView().reversed).toBe(true);
    // Under révolution a quad of 4s outranks a quad of 5s
    expect(game.play("p1", fours)).toEqual({ ok: true });
    expect(game.getView().reversed).toBe(false); // second quad toggles back
  });

  it("makes jokers the top rank — only a 2 beats them", () => {
    const game = gameWith([
      [N("3", "clubs"), JK(0)],
      [N("A"), N("2")],
      [N("9"), N("6")],
    ]);
    game.play("p0", [JK(0)]); // p0 leads a joker
    expect(game.play("p1", [N("A")])).toEqual({ ok: false, error: "CANNOT_BEAT" });
    expect(game.play("p1", [N("2")])).toEqual({ ok: true }); // the bomb clears it
    expect(game.getView().pile).toBeNull();
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
