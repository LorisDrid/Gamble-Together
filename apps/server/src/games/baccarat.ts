import { BaccaratGame, DEFAULT_BACCARAT_SETTINGS } from "@gamble/shared";

import { clampInt, escalatedStake, pending } from "./helpers";
import type { GameModule } from "./types";

export const baccarat: GameModule<"baccarat"> = {
  kind: "baccarat",
  minPlayers: 1,

  create: (seats, startingChips, input) =>
    new BaccaratGame(seats, {
      startingChips,
      minBet: clampInt(input.minBet, 1, startingChips, DEFAULT_BACCARAT_SETTINGS.minBet),
      deckCount: DEFAULT_BACCARAT_SETTINGS.deckCount,
    }),

  actions: {
    "baccarat:bet": (game, playerId, bet) => game.placeBet(playerId, bet),
    "baccarat:clearBets": (game, playerId) => game.clearBets(playerId),
    "baccarat:ready": (game, playerId) => game.setReady(playerId),
    "baccarat:rebuy": (game, playerId) => game.rebuy(playerId),
    "baccarat:nextRound": (game) => game.nextRound(),
  },
  blockedInTournament: ["baccarat:rebuy"],

  isPrivate: () => false,
  view: (game) => ({ game: "baccarat", view: game.getView() }),

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
      `baccarat:${view.round}`,
      view.players
        .filter((p) => !p.ready && (p.chips >= view.settings.minBet || p.bets.length > 0))
        .map((p) => p.id),
    );
  },
  // Any bets already placed stand; with none, this passes the coup
  playDefault: (game, playerId) => {
    game.setReady(playerId);
  },

  tournament: {
    baseStake: (game) => game.getView().settings.minBet,
    floor: (game) => game.getView().settings.minBet,
    applyStake: (game, base, multiplier) => game.setMinBet(escalatedStake(base, multiplier)),
  },
};
