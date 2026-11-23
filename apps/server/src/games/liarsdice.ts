import {
  DEFAULT_LIARS_DICE_SETTINGS,
  LIARS_DICE_MIN_PLAYERS,
  LiarsDiceGame,
  smallestRaise,
} from "@gamble/shared";

import { clampInt, pending } from "./helpers";
import type { GameModule } from "./types";

export const liarsdice: GameModule<"liarsdice"> = {
  kind: "liarsdice",
  minPlayers: LIARS_DICE_MIN_PLAYERS,

  create: (seats, startingChips, input) =>
    new LiarsDiceGame(seats, {
      startingChips,
      ante: clampInt(input.ante, 1, startingChips, DEFAULT_LIARS_DICE_SETTINGS.ante),
      diceCount: DEFAULT_LIARS_DICE_SETTINGS.diceCount,
    }),

  actions: {
    "liarsdice:bid": (game, playerId, quantity, face) => game.bid(playerId, quantity, face),
    "liarsdice:challenge": (game, playerId) => game.challenge(playerId),
    "liarsdice:nextRound": (game) => game.nextRound(),
  },

  // Dice are private: one view per player
  isPrivate: () => true,
  view: (game, viewerId) => ({ game: "liarsdice", view: game.getView(viewerId) }),

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
    if (view.phase !== "bidding" || !view.currentPlayerId) return null;
    const bid = view.currentBid;
    return pending(
      `liarsdice:${view.round}:${view.currentPlayerId}:${bid?.quantity}:${bid?.face}`,
      [view.currentPlayerId],
    );
  },
  // Never challenges: an absent player only keeps the bidding going
  playDefault: (game, playerId) => {
    const { quantity, face } = smallestRaise(game.getView().currentBid);
    game.bid(playerId, quantity, face);
  },
};
