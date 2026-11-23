import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BaccaratGame, DEFAULT_BACCARAT_SETTINGS, type TournamentSettings } from "@gamble/shared";

import { RoomManager } from "./roomManager";

/**
 * Tournament legs for every game. Driven like the socket server does it: play
 * a round, `settlement` + `tournamentAfterRound`, then end / start legs. Turn
 * games are played with the turn-timer defaults (`playTurnDefaults`), which are
 * deterministic; Liar's Dice is challenged by hand since its default never calls.
 */

const START = 1000;

beforeEach(() => {
  // Games capture Math.random at construction: pin it so deals are reproducible
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function table(ids: string[]): { rooms: RoomManager; code: string } {
  const rooms = new RoomManager();
  const [host, ...rest] = ids;
  const { code } = rooms.createRoom(host!, host!);
  for (const id of rest) rooms.joinRoom(id, code, id);
  return { rooms, code };
}

function startTournament(rooms: RoomManager, host: string, overrides: Partial<TournamentSettings>) {
  return rooms.startTournament(host, {
    games: [],
    startingChips: START,
    roundLimited: true,
    roundsPerLeg: 1,
    escalate: false,
    ...overrides,
  });
}

/** Mirror of the server's `progressAfterSettle`. */
function settleRound(rooms: RoomManager, code: string): "leg-over" | "continue" {
  const settled = rooms.settlement(code);
  if (!settled) throw new Error("round has not settled");
  return rooms.tournamentAfterRound(code, settled.round)?.endLeg ? "leg-over" : "continue";
}

/** Lets the turn-timer defaults play until the current round settles. */
function playOutRound(rooms: RoomManager, code: string): void {
  for (let guard = 0; guard < 500 && !rooms.settlement(code); guard++) rooms.playTurnDefaults(code);
  if (!rooms.settlement(code)) throw new Error("round never settled");
}

/** Everyone bets the minimum and stands: a blackjack round that always settles. */
function playBlackjackRound(rooms: RoomManager, host: string): void {
  const { game } = rooms.withGame(host, "blackjack")!;
  for (const p of game.getView().players) game.placeBet(p.id, 10);
  for (let guard = 0; guard < 50 && game.getView().phase === "playing"; guard++) {
    const actor = game.getView().players.find((p) => p.canAct);
    if (!actor) break;
    game.stand(actor.id);
  }
}

/** Ends the current leg and starts the next one, as the intermission timer would. */
function nextLeg(rooms: RoomManager, code: string): boolean {
  expect(rooms.endTournamentLeg(code)?.phase).toBe("intermission");
  return rooms.startTournamentLeg(code);
}

const chipLeaders = (chips: Array<{ id: string; chips: number }>) => {
  const max = Math.max(...chips.map((p) => p.chips));
  return chips.filter((p) => p.chips === max).map((p) => p.id).sort();
};

describe("tournament with every game", () => {
  it("plays the chosen legs in the fixed order, whatever order they were asked in", () => {
    const { rooms, code } = table(["p1", "p2", "p3"]);
    const res = startTournament(rooms, "p1", {
      games: ["liarsdice", "blackjack", "president", "baccarat"],
    });
    expect(res.ok).toBe(true);
    expect(rooms.tournamentView(code)?.games).toEqual(["blackjack", "baccarat", "president", "liarsdice"]);
    expect(rooms.tournamentView(code)?.legRule).toBe("stake");
  });

  it("refuses a leg the seated players can't fill", () => {
    const pair = table(["p1", "p2"]);
    expect(startTournament(pair.rooms, "p1", { games: ["blackjack", "president"] })).toEqual({
      ok: false,
      error: "NOT_ENOUGH_PLAYERS",
    });
    const solo = table(["p1"]);
    expect(startTournament(solo.rooms, "p1", { games: ["blackjack", "poker"] })).toEqual({
      ok: false,
      error: "NOT_ENOUGH_PLAYERS",
    });
    expect(startTournament(solo.rooms, "p1", { games: ["blackjack", "baccarat"] }).ok).toBe(true);
  });

  it("plays a baccarat leg with elimination and rising stakes", () => {
    // Find a pinned RNG value whose coup is not a tie, so a bet can surely lose
    const probe = (value: number) => {
      const game = new BaccaratGame([{ id: "x", nickname: "x" }], DEFAULT_BACCARAT_SETTINGS, () => value);
      game.setReady("x");
      return game.getView().outcome!;
    };
    const value = [0.5, 0.3, 0.7, 0.1, 0.9].find((v) => probe(v) !== "tie")!;
    const outcome = probe(value);
    vi.spyOn(Math, "random").mockReturnValue(value);

    const { rooms, code } = table(["p1", "p2"]);
    // Baccarat comes before poker in the fixed order, so it is the first leg
    startTournament(rooms, "p1", { games: ["poker", "baccarat"], roundLimited: false, escalate: true });
    const { game } = rooms.withGame("p1", "baccarat")!;
    game.placeBet("p1", { kind: outcome, amount: 10 });
    game.placeBet("p2", { kind: outcome === "player" ? "banker" : "player", amount: START });
    game.setReady("p1");
    game.setReady("p2");

    expect(settleRound(rooms, code)).toBe("leg-over"); // p2 is broke: only p1 can still play
    const view = rooms.tournamentView(code)!;
    expect(view.stakeMultiplier).toBe(2);
    expect(view.eliminated).toEqual(["p2"]);
    expect(game.getView().settings.minBet).toBe(DEFAULT_BACCARAT_SETTINGS.minBet * 2);
  });

  it("plays a Président leg for exactly N rounds, with no elimination or rising stakes", () => {
    const { rooms, code } = table(["p1", "p2", "p3"]);
    // Elimination + rising stakes asked: they must not apply to Président
    startTournament(rooms, "p1", {
      games: ["blackjack", "president"],
      roundLimited: false,
      roundsPerLeg: 2,
      escalate: true,
    });
    playBlackjackRound(rooms, "p1");
    // The blackjack leg is in elimination mode: end it by hand to reach Président
    expect(nextLeg(rooms, code)).toBe(true);
    expect(rooms.tournamentView(code)?.legRule).toBe("rounds");

    playOutRound(rooms, code);
    expect(settleRound(rooms, code)).toBe("continue");
    expect(rooms.tournamentView(code)?.stakeMultiplier).toBe(1);
    expect(rooms.tournamentView(code)?.eliminated).toEqual([]);

    rooms.withGame("p1", "president")!.game.nextRound();
    playOutRound(rooms, code);
    expect(settleRound(rooms, code)).toBe("leg-over");

    const { game } = rooms.withGame("p1", "president")!;
    const leaders = chipLeaders(game.getView().players.map((p) => ({ id: p.id, chips: p.chips })));
    expect(rooms.endTournamentLeg(code)?.phase).toBe("done");
    expect(rooms.tournamentView(code)?.lastWinners.slice().sort()).toEqual(leaders);
  });

  it("plays a Liar's Dice leg as one whole game, its winner taking the point", () => {
    const { rooms, code } = table(["p1", "p2"]);
    startTournament(rooms, "p1", { games: ["roulette", "liarsdice"], roundsPerLeg: 1 });
    const roulette = rooms.withGame("p1", "roulette")!.game;
    roulette.setReady("p1");
    roulette.setReady("p2");
    expect(settleRound(rooms, code)).toBe("leg-over");
    expect(nextLeg(rooms, code)).toBe(true);
    expect(rooms.tournamentView(code)?.legRule).toBe("game");

    const { game } = rooms.withGame("p1", "liarsdice")!;
    for (let guard = 0; guard < 200 && game.getView().phase !== "done"; guard++) {
      const view = game.getView();
      expect(rooms.settlement(code)).toBeNull(); // nothing settles before the game ends
      if (view.phase === "reveal") game.nextRound();
      else if (view.currentBid) game.challenge(view.currentPlayerId!);
      else game.bid(view.currentPlayerId!, 1, 2);
    }
    expect(game.getView().phase).toBe("done");
    expect(settleRound(rooms, code)).toBe("leg-over");

    const winner = game.getView().winnerId!;
    expect(rooms.endTournamentLeg(code)?.phase).toBe("done");
    expect(rooms.tournamentView(code)?.lastWinners).toEqual([winner]);
  });

  it("skips a leg the players can no longer fill and moves on to the next", () => {
    const { rooms, code } = table(["p1", "p2", "p3"]);
    startTournament(rooms, "p1", { games: ["blackjack", "president", "liarsdice"] });
    playBlackjackRound(rooms, "p1");
    expect(settleRound(rooms, code)).toBe("leg-over");
    expect(rooms.endTournamentLeg(code)?.phase).toBe("intermission");

    rooms.leaveRoom("p3"); // during the intermission: Président now lacks a player
    expect(rooms.startTournamentLeg(code)).toBe(true);
    const view = rooms.tournamentView(code)!;
    expect(view.currentGame).toBe("liarsdice");
    expect(view.skippedLegs).toEqual([1]);
    expect(view.standings.every((s) => s.playerId !== "p3")).toBe(true);
  });

  it("ends the tournament when no remaining leg can be played", () => {
    const { rooms, code } = table(["p1", "p2", "p3"]);
    startTournament(rooms, "p1", { games: ["blackjack", "president"] });

    // A departure during the last playable leg: Président is skipped as soon as it ends
    rooms.leaveRoom("p3");
    playBlackjackRound(rooms, "p1");
    expect(settleRound(rooms, code)).toBe("leg-over");
    expect(rooms.endTournamentLeg(code)?.phase).toBe("done");
    expect(rooms.tournamentView(code)?.skippedLegs).toEqual([1]);
  });

  it("ends the tournament when the departure happens during the intermission", () => {
    const { rooms, code } = table(["p1", "p2", "p3"]);
    startTournament(rooms, "p1", { games: ["blackjack", "president"] });
    playBlackjackRound(rooms, "p1");
    settleRound(rooms, code);
    expect(rooms.endTournamentLeg(code)?.phase).toBe("intermission");

    rooms.leaveRoom("p3");
    expect(rooms.startTournamentLeg(code)).toBe(false);
    expect(rooms.tournamentView(code)?.phase).toBe("done");
    expect(rooms.tournamentView(code)?.skippedLegs).toEqual([1]);
  });
});
