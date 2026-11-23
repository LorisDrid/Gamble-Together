import { DEFAULT_ROULETTE_SETTINGS, RouletteGame } from "@gamble/shared";

import { clampInt, escalatedStake, pending } from "./helpers";
import type { GameModule } from "./types";

export const roulette: GameModule<"roulette"> = {
  kind: "roulette",
  minPlayers: 1,

  create: (seats, startingChips, input) =>
    new RouletteGame(seats, {
      startingChips,
      minBet: clampInt(input.minBet, 1, startingChips, DEFAULT_ROULETTE_SETTINGS.minBet),
    }),

  actions: {
    "roulette:bet": (game, playerId, bet) => game.placeBet(playerId, bet),
    "roulette:clearBets": (game, playerId) => game.clearBets(playerId),
    "roulette:ready": (game, playerId) => game.setReady(playerId),
    "roulette:rebuy": (game, playerId) => game.rebuy(playerId),
    "roulette:nextRound": (game) => game.nextRound(),
  },
  blockedInTournament: ["roulette:rebuy"],

  isPrivate: () => false,
  view: (game) => ({ game: "roulette", view: game.getView() }),

  settlement: (game) => {
    const view = game.getView();
    if (view.phase !== "result") return null;
    const nets = view.players
      .filter((p) => p.bets.length > 0 && p.lastNet !== null)
      .map((p) => ({ playerId: p.id, net: p.lastNet! }));
    return { round: view.round, nets };
  },
  chips: (game) => game.getView().players.map((p) => ({ id: p.id, chips: p.chips })),

  pendingDecision: (game) => {
    const view = game.getView();
    if (view.phase !== "betting") return null;
    return pending(
      `roulette:${view.round}`,
      view.players
        .filter((p) => !p.ready && (p.chips >= view.settings.minBet || p.bets.length > 0))
        .map((p) => p.id),
    );
  },
  // Any bets already on the mat stand; with none, this passes the round
  playDefault: (game, playerId) => {
    game.setReady(playerId);
  },

  tournament: {
    baseStake: (game) => game.getView().settings.minBet,
    floor: (game) => game.getView().settings.minBet,
    applyStake: (game, base, multiplier) => game.setMinBet(escalatedStake(base, multiplier)),
  },
};
