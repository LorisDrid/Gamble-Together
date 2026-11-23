import { DEFAULT_PRESIDENT_SETTINGS, PRESIDENT_MIN_PLAYERS, PresidentGame } from "@gamble/shared";

import { clampInt, pending } from "./helpers";
import type { GameModule } from "./types";

export const president: GameModule<"president"> = {
  kind: "president",
  minPlayers: PRESIDENT_MIN_PLAYERS,

  create: (seats, startingChips, input) =>
    new PresidentGame(seats, {
      startingChips,
      ante: clampInt(input.ante, 1, startingChips, DEFAULT_PRESIDENT_SETTINGS.ante),
    }),

  actions: {
    "president:play": (game, playerId, cards) => game.play(playerId, cards),
    "president:pass": (game, playerId) => game.pass(playerId),
    "president:exchange": (game, playerId, cards) => game.exchangeReturn(playerId, cards),
    "president:nextRound": (game) => game.nextRound(),
  },

  // Hands are private: one view per player
  isPrivate: () => true,
  view: (game, viewerId) => ({ game: "president", view: game.getView(viewerId) }),

  settlement: (game) => {
    const view = game.getView();
    if (view.phase !== "done") return null;
    const nets = view.players
      .filter((p) => p.lastNet !== null)
      .map((p) => ({ playerId: p.id, net: p.lastNet! }));
    return { round: view.round, nets };
  },
  chips: (game) => game.getView().players.map((p) => ({ id: p.id, chips: p.chips })),

  pendingDecision: (game) => {
    const view = game.getView();
    if (view.phase === "exchange") {
      return pending(
        `president:${view.round}:exchange`,
        view.pendingReturns.map((r) => r.fromId),
      );
    }
    if (view.phase !== "playing" || !view.currentPlayerId) return null;
    // The card count tells apart a player who leads again right after playing
    const cards = view.players.reduce((sum, p) => sum + p.handCount, 0);
    return pending(`president:${view.round}:${view.currentPlayerId}:${cards}`, [
      view.currentPlayerId,
    ]);
  },
  playDefault: (game, playerId) => {
    const view = game.getView(playerId);
    // The view sorts the hand from weakest to strongest
    const hand = view.players.find((p) => p.id === playerId)?.hand ?? [];
    if (view.phase === "exchange") {
      const owed = view.pendingReturns.find((r) => r.fromId === playerId);
      if (owed) game.exchangeReturn(playerId, hand.slice(0, owed.count));
    } else if (view.pile) {
      game.pass(playerId);
    } else if (hand[0]) {
      game.play(playerId, [hand[0]]);
    }
  },
};
