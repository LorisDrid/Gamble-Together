import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ROULETTE_MAX_NUMBER, type RouletteBet, type TournamentSettings } from "@gamble/shared";

import { RoomManager } from "./roomManager";

/**
 * Tournament orchestration tests. They drive the RoomManager exactly the way the
 * socket server (apps/server/src/index.ts) does — settle a round, call
 * `tournamentAfterRound`, then end the leg and advance — but without sockets,
 * timers or the stats DB. Roulette is the deterministic engine: pinning the
 * wheel lets us engineer precise chip outcomes (ties, simultaneous knockouts)
 * and verify that points accumulate from leg to leg.
 *
 * The games capture `Math.random` as their RNG *at construction time* (default
 * parameter), so the spy MUST be installed (beforeEach) before any game is
 * built; `setWinning` then just retargets that same spy.
 */

const START = 1000;
const MIN_BET = 10; // DEFAULT_ROULETTE_SETTINGS / DEFAULT_BLACKJACK_SETTINGS.minBet

// One spy instance, installed before any game is built so the games capture it
// as their RNG; `setWinning` retargets THIS same instance (a fresh vi.spyOn call
// would create a different spy the games don't hold).
let randomSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // Any non-zero default keeps the blackjack shuffle deterministic.
  randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Retarget the wheel so the next spin lands on `n` (spinWheel = floor(rng * 37)). */
function setWinning(n: number): void {
  randomSpy.mockReturnValue((n + 0.5) / (ROULETTE_MAX_NUMBER + 1));
}

function makeRoom(rooms: RoomManager, ids: string[]): string {
  const [host, ...rest] = ids;
  const { code } = rooms.createRoom(host!, host!); // nickname = id, for readable assertions
  for (const id of rest) {
    const result = rooms.joinRoom(id, code, id);
    if (!result.ok) throw new Error(`join failed: ${result.error}`);
  }
  return code;
}

function startTournament(
  rooms: RoomManager,
  host: string,
  overrides: Partial<TournamentSettings> & Pick<TournamentSettings, "games">,
): void {
  const result = rooms.startTournament(host, {
    startingChips: START,
    roundLimited: true,
    roundsPerLeg: 1,
    escalate: false,
    ...overrides,
  });
  if (!result.ok) throw new Error(`startTournament failed: ${result.error}`);
}

/** Play one roulette round: place every player's bets, pin the wheel, validate. */
function playRouletteRound(
  rooms: RoomManager,
  host: string,
  winning: number,
  bets: Record<string, RouletteBet[]>,
): void {
  const active = rooms.withRoulette(host);
  if (!active) throw new Error("roulette is not the active game");
  const { game } = active;
  for (const player of game.getView().players) {
    for (const bet of bets[player.id] ?? []) {
      const placed = game.placeBet(player.id, bet);
      if (!placed.ok) throw new Error(`bet rejected for ${player.id}: ${placed.error}`);
    }
  }
  setWinning(winning);
  // The wheel spins automatically once the last solvent player validates; a
  // player who shoved their whole stack can't be the trigger (0 chips left).
  for (const player of game.getView().players) game.setReady(player.id);
  if (game.getView().phase !== "result") throw new Error("the wheel did not spin");
}

/** Play one blackjack round: everyone bets the minimum and stands immediately. */
function playBlackjackRound(rooms: RoomManager, host: string): void {
  const active = rooms.withBlackjack(host);
  if (!active) throw new Error("blackjack is not the active game");
  const { game } = active;
  for (const player of game.getView().players) game.placeBet(player.id, MIN_BET);
  for (let guard = 0; guard < 50 && game.getView().phase === "playing"; guard++) {
    const actor = game.getView().players.find((p) => p.canAct);
    if (!actor) break;
    game.stand(actor.id);
  }
  if (game.getView().phase !== "payout") throw new Error("blackjack round did not settle");
}

/**
 * Mirror of the server's `progressAfterSettle`: fold the settled round into the
 * tournament and report whether the leg is over.
 */
function settleRound(rooms: RoomManager, code: string): "leg-over" | "continue" {
  const settled = rooms.settlement(code);
  if (!settled) throw new Error("round has not settled");
  const result = rooms.tournamentAfterRound(code, settled.round);
  return result?.endLeg ? "leg-over" : "continue";
}

function pointsByPlayer(rooms: RoomManager, code: string): Record<string, number> {
  const view = rooms.tournamentView(code);
  if (!view) throw new Error("no tournament view");
  return Object.fromEntries(view.standings.map((s) => [s.playerId, s.points]));
}

describe("tournament orchestration", () => {
  it("carries points from one leg to the next (blackjack → roulette)", () => {
    const rooms = new RoomManager();
    const ids = ["p1", "p2", "p3"];
    const code = makeRoom(rooms, ids);
    startTournament(rooms, "p1", { games: ["blackjack", "roulette"] });

    // Leg 0 — blackjack. The deal is deterministic (pinned RNG) but we don't
    // hard-code who wins; we only assert the leg awarded exactly one point per
    // chip leader, then snapshot the standings.
    playBlackjackRound(rooms, "p1");
    expect(settleRound(rooms, code)).toBe("leg-over");
    expect(rooms.endTournamentLeg(code)?.phase).toBe("intermission");
    expect(rooms.startTournamentLeg(code)).toBe(true); // intermission → next leg

    const afterLeg0 = pointsByPlayer(rooms, code);
    const leg0Total = Object.values(afterLeg0).reduce((a, b) => a + b, 0);
    expect(leg0Total).toBeGreaterThanOrEqual(1);
    for (const points of Object.values(afterLeg0)) expect([0, 1]).toContain(points);

    // Leg 1 — roulette. Pin a green zero and make p2 the sole winner (a straight
    // on 0 pays 36×) while the others lose their outside bets.
    playRouletteRound(rooms, "p1", 0, {
      p1: [{ kind: "red", amount: 100 }],
      p2: [{ kind: "straight", number: 0, amount: 100 }],
      p3: [{ kind: "black", amount: 100 }],
    });
    expect(settleRound(rooms, code)).toBe("leg-over");
    expect(rooms.endTournamentLeg(code)?.phase).toBe("done");

    // Persistence: every leg-0 point is intact, and only p2 gained one in leg 1.
    const afterLeg1 = pointsByPlayer(rooms, code);
    for (const id of ids) {
      expect(afterLeg1[id]).toBe(afterLeg0[id]! + (id === "p2" ? 1 : 0));
    }
    expect(afterLeg1["p2"]).toBe(afterLeg0["p2"]! + 1);

    // Tournament is finished and no further leg can start.
    expect(rooms.tournamentView(code)?.phase).toBe("done");
    expect(rooms.startTournamentLeg(code)).toBe(false);
  });

  it("awards a point to every tied chip leader (round-limited leg)", () => {
    const rooms = new RoomManager();
    const code = makeRoom(rooms, ["p1", "p2", "p3"]);
    startTournament(rooms, "p1", { games: ["roulette", "poker"] });

    // Winning number 1 is red: p1 and p2 win equally (+100), p3 loses (-100).
    playRouletteRound(rooms, "p1", 1, {
      p1: [{ kind: "red", amount: 100 }],
      p2: [{ kind: "red", amount: 100 }],
      p3: [{ kind: "black", amount: 100 }],
    });
    expect(settleRound(rooms, code)).toBe("leg-over");
    expect(rooms.endTournamentLeg(code)?.phase).toBe("intermission");

    expect(pointsByPlayer(rooms, code)).toEqual({ p1: 1, p2: 1, p3: 0 });
    expect(rooms.tournamentView(code)?.lastWinners.slice().sort()).toEqual(["p1", "p2"]);
  });

  it("ties the leg when the last two players lose the same round (round-limited)", () => {
    const rooms = new RoomManager();
    const code = makeRoom(rooms, ["p1", "p2"]);
    startTournament(rooms, "p1", { games: ["roulette", "poker"] });

    // Green zero: both stake the same on red and both lose together, staying
    // level (900 each). Co-leaders at the round limit → both score.
    playRouletteRound(rooms, "p1", 0, {
      p1: [{ kind: "red", amount: 100 }],
      p2: [{ kind: "red", amount: 100 }],
    });
    expect(settleRound(rooms, code)).toBe("leg-over");
    expect(rooms.endTournamentLeg(code)?.phase).toBe("intermission");

    expect(pointsByPlayer(rooms, code)).toEqual({ p1: 1, p2: 1 });
    expect(rooms.tournamentView(code)?.lastWinners.slice().sort()).toEqual(["p1", "p2"]);
  });

  it("ends an elimination leg and ties when escalation knocks the last two out together", () => {
    const rooms = new RoomManager();
    const code = makeRoom(rooms, ["p1", "p2", "p3"]);
    startTournament(rooms, "p1", {
      games: ["roulette", "poker"],
      roundLimited: false,
      roundsPerLeg: 3,
      escalate: true,
    });

    // Green zero: everyone loses. p3 busts below the base floor (10), which
    // raises the min bet to 20; that higher floor then knocks out p1 and p2
    // (15 each) in the SAME round, so no one can still play (active === 0).
    playRouletteRound(rooms, "p1", 0, {
      p1: [{ kind: "red", amount: 985 }], // → 15 left
      p2: [{ kind: "red", amount: 985 }], // → 15 left (these two trigger the spin)
      p3: [{ kind: "red", amount: 995 }], // → 5 left, busts first
    });
    expect(settleRound(rooms, code)).toBe("leg-over");
    expect(rooms.endTournamentLeg(code)?.phase).toBe("intermission");

    // p1 and p2 tie at the top (15 each) → both score; p3 (5) does not.
    expect(pointsByPlayer(rooms, code)).toEqual({ p1: 1, p2: 1, p3: 0 });
    expect(rooms.tournamentView(code)?.lastWinners.slice().sort()).toEqual(["p1", "p2"]);
  });

  it("ends an elimination leg when a single survivor remains", () => {
    const rooms = new RoomManager();
    const code = makeRoom(rooms, ["p1", "p2"]);
    startTournament(rooms, "p1", {
      games: ["roulette", "poker"],
      roundLimited: false,
      roundsPerLeg: 3,
    });

    // p1 passes (keeps the stack and triggers the spin), p2 shoves and busts.
    playRouletteRound(rooms, "p1", 0, {
      p1: [],
      p2: [{ kind: "red", amount: START }],
    });
    expect(settleRound(rooms, code)).toBe("leg-over"); // only p1 can still play
    expect(rooms.endTournamentLeg(code)?.phase).toBe("intermission");

    expect(pointsByPlayer(rooms, code)).toEqual({ p1: 1, p2: 0 });
    expect(rooms.tournamentView(code)?.lastWinners).toEqual(["p1"]);
  });

  it("resets per-leg elimination state on the next leg but keeps the points", () => {
    const rooms = new RoomManager();
    const code = makeRoom(rooms, ["p1", "p2"]);
    startTournament(rooms, "p1", {
      games: ["roulette", "poker"],
      roundLimited: false,
      roundsPerLeg: 3,
    });

    // Leg 0: p2 is eliminated, p1 wins the leg.
    playRouletteRound(rooms, "p1", 0, {
      p1: [],
      p2: [{ kind: "red", amount: START }],
    });
    expect(settleRound(rooms, code)).toBe("leg-over");
    expect(rooms.endTournamentLeg(code)?.phase).toBe("intermission");
    expect(rooms.startTournamentLeg(code)).toBe(true);

    // The point survives into the next leg; the eliminated set and stake reset.
    const view = rooms.tournamentView(code)!;
    expect(view.currentGame).toBe("poker");
    expect(view.phase).toBe("playing");
    expect(view.eliminated).toEqual([]);
    expect(view.stakeMultiplier).toBe(1);
    expect(pointsByPlayer(rooms, code)).toEqual({ p1: 1, p2: 0 });
  });
});
