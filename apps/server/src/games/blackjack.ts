import {
  BLACKJACK_DEALER_REVEAL_MS,
  BlackjackGame,
  DEFAULT_BLACKJACK_SETTINGS,
  payout,
} from "@gamble/shared";

import { clampInt, escalatedStake, pending } from "./helpers";
import type { GameModule } from "./types";

/**
 * Rounds chain on their own: after the payout the result shows this long, plus
 * one reveal beat per card the dealer drew (see BLACKJACK_DEALER_REVEAL_MS).
 */
const NEXT_ROUND_DELAY_MS = 4000;

export const blackjack: GameModule<"blackjack"> = {
  kind: "blackjack",
  minPlayers: 1,

  create: (seats, startingChips, input) =>
    new BlackjackGame(seats, {
      startingChips,
      minBet: clampInt(input.minBet, 1, startingChips, DEFAULT_BLACKJACK_SETTINGS.minBet),
      deckCount: DEFAULT_BLACKJACK_SETTINGS.deckCount,
      sabotage: input.sabotage === true,
    }),

  actions: {
    "blackjack:bet": (game, playerId, amount) => game.placeBet(playerId, amount),
    "blackjack:hit": (game, playerId) => game.hit(playerId),
    "blackjack:stand": (game, playerId) => game.stand(playerId),
    "blackjack:double": (game, playerId) => game.double(playerId),
    "blackjack:split": (game, playerId) => game.split(playerId),
    "blackjack:rebuy": (game, playerId) => game.rebuy(playerId),
    "blackjack:nextRound": (game) => game.nextRound(),
    "blackjack:power": (game, playerId, power) => game.usePower(playerId, power),
    "blackjack:skipPower": (game, playerId) => game.skipPower(playerId),
  },
  blockedInTournament: ["blackjack:rebuy"],

  // Sabotage hides held powers and shields per player; plain blackjack has no secrets
  isPrivate: (game) => Boolean(game.getView().settings.sabotage),
  view: (game, viewerId) => ({ game: "blackjack", view: game.getView(viewerId) }),

  settlement: (game) => {
    const view = game.getView();
    if (view.phase !== "payout") return null;
    const nets = view.players
      .filter((p) => p.inRound && p.bet !== null && p.result !== null)
      .map((p) => ({ playerId: p.id, net: payout(p.bet!, p.result!) - p.bet! }));
    return { round: view.round, nets };
  },
  chips: (game) => game.getView().players.map((p) => ({ id: p.id, chips: p.chips })),

  pendingDecision: (game) => {
    const view = game.getView();
    const key = `blackjack:${view.round}:${view.phase}`;
    if (view.phase === "betting") {
      return pending(
        key,
        view.players
          .filter((p) => p.bet === null && !p.skipping && p.chips >= view.settings.minBet)
          .map((p) => p.id),
      );
    }
    if (view.phase !== "playing") return null;
    // A held power is only visible in its owner's own view
    const blocking = view.players.filter((p) => {
      const own = game.getView(p.id).players.find((seat) => seat.id === p.id);
      return own?.canAct || own?.pendingPower;
    });
    return pending(key, blocking.map((p) => p.id));
  },
  playDefault: (game, playerId) => {
    const seat = () => game.getView(playerId).players.find((p) => p.id === playerId);
    if (game.getView().phase === "betting") {
      game.skipRound(playerId);
      return;
    }
    if (seat()?.pendingPower) game.skipPower(playerId);
    // A split seat has one more hand to finish
    while (seat()?.canAct) {
      if (!game.stand(playerId).ok) break;
    }
  },

  autoNextRound: {
    delayMs: (game) => {
      const view = game.getView();
      if (view.phase !== "payout") return null;
      const drawnCards = Math.max(0, view.dealerHand.length - 2);
      return NEXT_ROUND_DELAY_MS + drawnCards * BLACKJACK_DEALER_REVEAL_MS;
    },
    advance: (game) => {
      game.nextRound();
    },
  },

  tournament: {
    baseStake: (game) => game.getView().settings.minBet,
    floor: (game) => game.getView().settings.minBet,
    applyStake: (game, base, multiplier) => game.setMinBet(escalatedStake(base, multiplier)),
  },
};
