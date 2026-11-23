import { DEFAULT_POKER_SETTINGS, PokerGame } from "@gamble/shared";

import { clampInt, escalatedStake, pending } from "./helpers";
import type { GameModule } from "./types";

export const poker: GameModule<"poker"> = {
  kind: "poker",
  // One player can open the table; the engine waits for a second to deal
  minPlayers: 1,

  create: (seats, startingChips, input) => {
    const smallBlind = clampInt(
      input.smallBlind,
      1,
      Math.floor(startingChips / 2),
      DEFAULT_POKER_SETTINGS.smallBlind,
    );
    return new PokerGame(seats, {
      startingChips,
      smallBlind,
      bigBlind: clampInt(input.bigBlind, smallBlind, startingChips, smallBlind * 2),
    });
  },

  actions: {
    "poker:fold": (game, playerId) => game.fold(playerId),
    "poker:check": (game, playerId) => game.check(playerId),
    "poker:call": (game, playerId) => game.call(playerId),
    "poker:raise": (game, playerId, amount) => game.raiseTo(playerId, amount),
    "poker:nextHand": (game) => game.nextHand(),
    "poker:rebuy": (game, playerId) => game.rebuy(playerId),
  },
  blockedInTournament: ["poker:rebuy"],

  // Hole cards are private: never broadcast the raw table
  isPrivate: () => true,
  view: (game, viewerId) => ({ game: "poker", view: game.getViewFor(viewerId) }),

  // Chips, commitments and results are public, so the public view settles everyone
  settlement: (game) => {
    const view = game.getViewFor("");
    if (view.phase !== "showdown") return null;
    const nets = view.players
      .filter((p) => p.committed > 0 || p.result !== null)
      .map((p) => ({ playerId: p.id, net: (p.result?.winnings ?? 0) - p.committed }));
    return { round: view.handNumber, nets };
  },
  chips: (game) => game.getViewFor("").players.map((p) => ({ id: p.id, chips: p.chips })),

  pendingDecision: (game) => {
    const { currentPlayerId } = game.getViewFor("");
    if (!currentPlayerId) return null;
    const view = game.getViewFor(currentPlayerId);
    if (!view.turn) return null;
    return pending(`poker:${view.handNumber}:${view.phase}:${currentPlayerId}:${view.pot}`, [
      currentPlayerId,
    ]);
  },
  playDefault: (game, playerId) => {
    const { turn } = game.getViewFor(playerId);
    if (turn?.canCheck) game.check(playerId);
    else game.fold(playerId);
  },

  tournament: {
    baseStake: (game) => game.getViewFor("").settings.bigBlind,
    // Any chips at all keep a player in a poker leg
    floor: () => 1,
    applyStake: (game, base, multiplier) => {
      const stake = escalatedStake(base, multiplier);
      game.setBlinds(Math.max(1, Math.round(stake / 2)), stake);
    },
  },
};
