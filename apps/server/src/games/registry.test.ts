import { describe, expect, it } from "vitest";

import { ACK_POSITION } from "../socketGuard";
import { GAMES, GAME_ACTION_EVENTS, TOURNAMENT_ORDER, isBlockedInTournament, isGameKind } from ".";

const KINDS = ["baccarat", "blackjack", "liarsdice", "poker", "president", "roulette"];
const isGameEvent = (event: string) => KINDS.some((kind) => event.startsWith(`${kind}:`));

describe("game registry", () => {
  it("has one module per game, each under its own kind", () => {
    expect(Object.keys(GAMES).sort()).toEqual(KINDS);
    for (const [kind, module] of Object.entries(GAMES)) expect(module.kind).toBe(kind);
  });

  it("handles exactly the game events the message guard lets through", () => {
    const guarded = Object.keys(ACK_POSITION).filter(isGameEvent).sort();
    expect([...GAME_ACTION_EVENTS].sort()).toEqual(guarded);
    expect(new Set(GAME_ACTION_EVENTS).size).toBe(GAME_ACTION_EVENTS.length);
  });

  it("keeps every game's events prefixed with its own kind", () => {
    for (const [kind, module] of Object.entries(GAMES)) {
      for (const event of Object.keys(module.actions)) expect(event.startsWith(`${kind}:`)).toBe(true);
    }
  });

  it("keeps the tournament legs and their order", () => {
    expect(TOURNAMENT_ORDER).toEqual(["blackjack", "roulette", "poker"]);
  });

  it("keeps the player minimums", () => {
    const minimums = Object.fromEntries(Object.entries(GAMES).map(([kind, m]) => [kind, m.minPlayers]));
    expect(minimums).toEqual({
      blackjack: 1,
      roulette: 1,
      poker: 1,
      president: 3,
      baccarat: 1,
      liarsdice: 2,
    });
  });

  it("blocks exactly the rebuys during a tournament", () => {
    const blocked = GAME_ACTION_EVENTS.filter(isBlockedInTournament).sort();
    expect(blocked).toEqual(["baccarat:rebuy", "blackjack:rebuy", "poker:rebuy", "roulette:rebuy"]);
  });

  it("only accepts real game kinds, not inherited names", () => {
    expect(isGameKind("poker")).toBe(true);
    for (const bad of ["constructor", "__proto__", "Poker", "", null, 42]) {
      expect(isGameKind(bad)).toBe(false);
    }
  });
});
