import { describe, expect, it } from "vitest";

import { BlackjackGame } from "./game";
import { DEFAULT_BLACKJACK_SETTINGS } from "./types";

function table(): BlackjackGame {
  const players = [
    { id: "a", nickname: "Alice" },
    { id: "b", nickname: "Bob" },
  ];
  return new BlackjackGame(players, DEFAULT_BLACKJACK_SETTINGS, () => 0.5);
}

const seat = (game: BlackjackGame, id: string) =>
  game.getView().players.find((p) => p.id === id)!;

describe("skipping a blackjack round", () => {
  it("deals without the skipper once everyone else has bet", () => {
    const game = table();
    expect(game.placeBet("a", 100).ok).toBe(true);
    expect(game.getView().phase).toBe("betting");

    expect(game.skipRound("b").ok).toBe(true);
    expect(game.getView().phase).not.toBe("betting");
    expect(seat(game, "b").inRound).toBe(false);
    expect(seat(game, "b").chips).toBe(DEFAULT_BLACKJACK_SETTINGS.startingChips);
  });

  it("waits quietly when everyone skips, until someone bets", () => {
    const game = table();
    game.skipRound("a");
    game.skipRound("b");
    expect(game.getView().phase).toBe("betting");

    expect(game.placeBet("a", 100).ok).toBe(true);
    expect(game.getView().phase).not.toBe("betting");
    expect(seat(game, "a").skipping).toBe(false);
    expect(seat(game, "b").inRound).toBe(false);
  });

  it("only lasts for the current round", () => {
    const game = table();
    game.placeBet("a", 100);
    game.skipRound("b");
    if (game.getView().phase === "playing") game.stand("a");
    expect(game.getView().phase).toBe("payout");

    game.nextRound();
    expect(seat(game, "b").skipping).toBe(false);
    game.placeBet("a", 100);
    expect(game.getView().phase).toBe("betting");
  });

  it("is refused once the player has bet or the cards are out", () => {
    const game = table();
    game.placeBet("a", 100);
    expect(game.skipRound("a")).toEqual({ ok: false, error: "ALREADY_BET" });
    game.skipRound("b");
    expect(game.skipRound("b")).toEqual({ ok: false, error: "WRONG_PHASE" });
    expect(game.skipRound("nobody")).toEqual({ ok: false, error: "WRONG_PHASE" });
  });
});
