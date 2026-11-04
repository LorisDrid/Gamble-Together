import { describe, expect, it } from "vitest";
import {
  BaccaratGame,
  BlackjackGame,
  DEFAULT_BACCARAT_SETTINGS,
  DEFAULT_BLACKJACK_SETTINGS,
  DEFAULT_LIARS_DICE_SETTINGS,
  DEFAULT_POKER_SETTINGS,
  DEFAULT_PRESIDENT_SETTINGS,
  DEFAULT_ROULETTE_SETTINGS,
  LiarsDiceGame,
  PokerGame,
  PresidentGame,
  RouletteGame,
} from "@gamble/shared";

import { pendingDecision, playDefault } from "./autoPlay";
import type { ActiveGame } from "./roomManager";
import { RoomManager } from "./roomManager";

const players = (...ids: string[]) => ids.map((id) => ({ id, nickname: id }));

/** Lets the clock run out until nobody is awaited, as an entirely absent table would. */
function runOut(active: ActiveGame, limit = 500): number {
  let timeouts = 0;
  for (let decision = pendingDecision(active); decision; decision = pendingDecision(active)) {
    if (++timeouts > limit) throw new Error("the table never stops waiting");
    for (const id of decision.playerIds) playDefault(active, id);
  }
  return timeouts;
}

describe("poker defaults", () => {
  const start = () => {
    const game = new PokerGame(players("a", "b"), DEFAULT_POKER_SETTINGS);
    return { game, active: { kind: "poker", game } as ActiveGame };
  };

  it("folds facing a bet", () => {
    const { game, active } = start();
    const [actor] = pendingDecision(active)!.playerIds;
    expect(game.getViewFor(actor!).turn?.canCheck).toBe(false);

    playDefault(active, actor!);
    const view = game.getViewFor(actor!);
    expect(view.phase).toBe("showdown");
    expect(view.players.find((p) => p.id === actor)?.folded).toBe(true);
    expect(pendingDecision(active)).toBeNull();
  });

  it("checks when nothing is owed, without folding the hand away", () => {
    const { game, active } = start();
    const first = pendingDecision(active)!.playerIds[0]!;
    expect(game.call(first).ok).toBe(true);

    const second = pendingDecision(active)!.playerIds[0]!;
    expect(game.getViewFor(second).turn?.canCheck).toBe(true);
    playDefault(active, second);
    const view = game.getViewFor(second);
    expect(view.phase).toBe("flop");
    expect(view.players.some((p) => p.folded)).toBe(false);
  });

  it("restarts the clock for each decision", () => {
    const { game, active } = start();
    const before = pendingDecision(active)!;
    expect(game.call(before.playerIds[0]!).ok).toBe(true);
    expect(pendingDecision(active)!.key).not.toBe(before.key);
  });
});

describe("président defaults", () => {
  const start = () => {
    const game = new PresidentGame(players("a", "b", "c"), DEFAULT_PRESIDENT_SETTINGS);
    return { game, active: { kind: "president", game } as ActiveGame };
  };

  it("leads with the weakest card and passes when following", () => {
    const { game, active } = start();
    const leader = pendingDecision(active)!.playerIds[0]!;
    const weakest = game.getView(leader).players.find((p) => p.id === leader)!.hand![0]!;

    playDefault(active, leader);
    expect(game.getView().pile?.cards).toEqual([weakest]);

    const follower = pendingDecision(active)!.playerIds[0]!;
    expect(follower).not.toBe(leader);
    const cards = game.getView().players.find((p) => p.id === follower)!.handCount;
    playDefault(active, follower);
    expect(game.getView().players.find((p) => p.id === follower)!.handCount).toBe(cards);
    expect(game.getView().players.find((p) => p.id === follower)!.passed).toBe(true);
  });

  it("finishes a whole round when nobody plays, then stops", () => {
    const { game, active } = start();
    runOut(active);
    expect(game.getView().phase).toBe("done");
    expect(pendingDecision(active)).toBeNull();
  });

  it("returns the weakest cards during the exchange", () => {
    const { game, active } = start();
    runOut(active);
    game.nextRound();

    const decision = pendingDecision(active)!;
    expect(game.getView().phase).toBe("exchange");
    const giver = decision.playerIds[0]!;
    const owed = game.getView().pendingReturns.find((r) => r.fromId === giver)!;
    const weakest = game.getView(giver).players.find((p) => p.id === giver)!.hand!.slice(0, owed.count);

    playDefault(active, giver);
    expect(game.getView().phase).toBe("playing");
    const hand = game.getView(giver).players.find((p) => p.id === giver)!.hand!;
    for (const card of weakest) {
      expect(hand.some((c) => c.rank === card.rank && c.suit === card.suit)).toBe(false);
    }
  });
});

describe("liar's dice defaults", () => {
  it("only ever raises, by the smallest step, and never challenges", () => {
    const game = new LiarsDiceGame(players("a", "b"), DEFAULT_LIARS_DICE_SETTINGS);
    const active: ActiveGame = { kind: "liarsdice", game };

    playDefault(active, pendingDecision(active)!.playerIds[0]!);
    expect(game.getView().currentBid).toEqual({ quantity: 1, face: 2 });
    playDefault(active, pendingDecision(active)!.playerIds[0]!);
    expect(game.getView().currentBid).toEqual({ quantity: 1, face: 3 });

    for (let i = 0; i < 100; i++) playDefault(active, pendingDecision(active)!.playerIds[0]!);
    const view = game.getView();
    expect(view.phase).toBe("bidding");
    expect(view.players.every((p) => p.diceCount === DEFAULT_LIARS_DICE_SETTINGS.diceCount)).toBe(true);
  });
});

describe("blackjack defaults", () => {
  const start = (rng?: () => number, sabotage = false) => {
    const game = new BlackjackGame(
      players("a", "b"),
      { ...DEFAULT_BLACKJACK_SETTINGS, sabotage },
      rng,
    );
    return { game, active: { kind: "blackjack", game } as ActiveGame };
  };

  it("skips the round for whoever hasn't bet, and deals for the others", () => {
    const { game, active } = start(() => 0.5);
    game.placeBet("a", 100);
    expect(pendingDecision(active)!.playerIds).toEqual(["b"]);

    playDefault(active, "b");
    expect(game.getView().phase).not.toBe("betting");
    expect(game.getView().players.find((p) => p.id === "b")!.inRound).toBe(false);
  });

  it("stops the clock when the whole table skips", () => {
    const { game, active } = start(() => 0.5);
    expect(pendingDecision(active)!.playerIds).toEqual(["a", "b"]);
    runOut(active);
    expect(game.getView().phase).toBe("betting");
    expect(pendingDecision(active)).toBeNull();
  });

  it("stands for whoever is still playing, keeping one clock for the phase", () => {
    const { game, active } = start(() => 0.5);
    game.placeBet("a", 100);
    game.placeBet("b", 100);
    if (game.getView().phase !== "playing") return; // both dealt a natural
    const before = pendingDecision(active)!;
    runOut(active);
    expect(game.getView().phase).toBe("payout");
    expect(before.key).toContain("playing");
    expect(pendingDecision(active)).toBeNull();
  });

  it("gives up a held sabotage power so the round can settle", () => {
    // rng 0: every figure drawn on a hit grants a power
    const { game, active } = start(() => 0, true);
    let held = false;
    for (let round = 0; round < 50 && !held; round++) {
      game.placeBet("a", 10);
      game.placeBet("b", 10);
      for (let i = 0; i < 12 && game.getView().phase === "playing" && !held; i++) {
        game.hit("a");
        held = game.getView("a").players.find((p) => p.id === "a")!.pendingPower !== null;
      }
      if (!held) {
        runOut(active);
        game.nextRound();
      }
    }
    expect(held).toBe(true);
    expect(pendingDecision(active)!.playerIds).toContain("a");

    runOut(active);
    expect(game.getView().phase).toBe("payout");
    expect(game.getView("a").players.find((p) => p.id === "a")!.pendingPower).toBeNull();
  });
});

describe("betting-table defaults", () => {
  it("roulette passes an empty mat but keeps bets already placed", () => {
    const game = new RouletteGame(players("a", "b"), DEFAULT_ROULETTE_SETTINGS, () => 0.5);
    const active: ActiveGame = { kind: "roulette", game };
    game.placeBet("a", { kind: "red", amount: 100 });
    runOut(active);
    const view = game.getView();
    expect(view.phase).toBe("result");
    expect(view.players.find((p) => p.id === "a")!.bets).toHaveLength(1);
    expect(view.players.find((p) => p.id === "b")!.bets).toHaveLength(0);
    expect(view.players.find((p) => p.id === "b")!.chips).toBe(DEFAULT_ROULETTE_SETTINGS.startingChips);
    expect(pendingDecision(active)).toBeNull();
  });

  it("roulette doesn't wait for a broke player", () => {
    const game = new RouletteGame(players("a", "b"), { ...DEFAULT_ROULETTE_SETTINGS, startingChips: 100 }, () => 0.5);
    const active: ActiveGame = { kind: "roulette", game };
    game.setMinBet(200);
    expect(pendingDecision(active)).toBeNull();
  });

  it("baccarat passes the coup, costing nothing", () => {
    const game = new BaccaratGame(players("a", "b"), DEFAULT_BACCARAT_SETTINGS, () => 0.5);
    const active: ActiveGame = { kind: "baccarat", game };
    runOut(active);
    const view = game.getView();
    expect(view.phase).toBe("result");
    expect(view.players.every((p) => p.chips === DEFAULT_BACCARAT_SETTINGS.startingChips)).toBe(true);
    expect(pendingDecision(active)).toBeNull();
  });
});

describe("the table's turn timer", () => {
  const table = () => {
    const rooms = new RoomManager();
    const { code } = rooms.createRoom("host", "Alice", "token-of-the-host");
    rooms.joinRoom("guest", code, "Bob", "token-of-the-guest");
    return { rooms, code };
  };

  it("defaults to 60 seconds and survives between games", () => {
    const { rooms, code } = table();
    expect(rooms.roomStateByCode(code)?.turnTimer).toBe(60);
    expect(rooms.setTurnTimer("host", 30).ok).toBe(true);
    rooms.startGame("host", { game: "poker", settings: {} });
    expect(rooms.turnDecision(code)?.durationMs).toBe(30_000);
    expect(rooms.endGame("host")?.room.turnTimer).toBe(30);
  });

  it("only lets the host pick an offered duration", () => {
    const { rooms, code } = table();
    expect(rooms.setTurnTimer("guest", 30)).toEqual({ ok: false, error: "NOT_HOST" });
    for (const invalid of [null, undefined, 45, -1, "60", {}, [60]]) {
      expect(rooms.setTurnTimer("host", invalid)).toEqual({ ok: false, error: "INVALID_TURN_TIMER" });
    }
    expect(rooms.roomStateByCode(code)?.turnTimer).toBe(60);
    expect(rooms.setTurnTimer("outside", 30)).toEqual({ ok: false, error: "NO_ROOM" });
  });

  it("times nothing when disabled or outside a game", () => {
    const { rooms, code } = table();
    expect(rooms.turnDecision(code)).toBeNull();
    rooms.startGame("host", { game: "poker", settings: {} });
    expect(rooms.turnDecision(code)).not.toBeNull();
    rooms.setTurnTimer("host", 0);
    expect(rooms.turnDecision(code)).toBeNull();
  });

  it("plays the defaults for everyone awaited", () => {
    const { rooms, code } = table();
    rooms.startGame("host", { game: "baccarat", settings: {} });
    rooms.playTurnDefaults(code);
    expect(rooms.turnDecision(code)).toBeNull();
    expect(rooms.withBaccarat("host")?.game.getView().phase).toBe("result");
  });

  it("keeps running for a disconnected player, whose seat is on the clock too", () => {
    const { rooms, code } = table();
    rooms.startGame("host", { game: "poker", settings: {} });
    const awaited = rooms.turnDecision(code)!.playerIds[0]!;
    rooms.markDisconnected(awaited);
    expect(rooms.turnDecision(code)!.playerIds).toEqual([awaited]);
  });
});
