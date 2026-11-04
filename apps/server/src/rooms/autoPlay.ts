import { smallestRaise } from "@gamble/shared";

import type { ActiveGame } from "./roomManager";

/** Who the table is waiting for right now. */
export interface PendingDecision {
  /** Identifies the situation: the countdown restarts only when this changes. */
  key: string;
  playerIds: string[];
}

function pending(key: string, playerIds: string[]): PendingDecision | null {
  return playerIds.length > 0 ? { key, playerIds } : null;
}

/**
 * The decision holding up the game, if any. Only covers what a single absent
 * player can block: "next round" buttons work for anyone, so they never count.
 * Parallel-play games share one countdown per phase.
 */
export function pendingDecision(active: ActiveGame): PendingDecision | null {
  switch (active.kind) {
    case "blackjack": {
      const { game } = active;
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
    }
    case "roulette": {
      const view = active.game.getView();
      if (view.phase !== "betting") return null;
      return pending(
        `roulette:${view.round}`,
        view.players
          .filter((p) => !p.ready && (p.chips >= view.settings.minBet || p.bets.length > 0))
          .map((p) => p.id),
      );
    }
    case "baccarat": {
      const view = active.game.getView();
      if (view.phase !== "betting") return null;
      return pending(
        `baccarat:${view.round}`,
        view.players
          .filter((p) => !p.ready && (p.chips >= view.settings.minBet || p.bets.length > 0))
          .map((p) => p.id),
      );
    }
    case "poker": {
      const { game } = active;
      const { currentPlayerId } = game.getViewFor("");
      if (!currentPlayerId) return null;
      const view = game.getViewFor(currentPlayerId);
      if (!view.turn) return null;
      return pending(
        `poker:${view.handNumber}:${view.phase}:${currentPlayerId}:${view.pot}`,
        [currentPlayerId],
      );
    }
    case "president": {
      const view = active.game.getView();
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
    }
    case "liarsdice": {
      const view = active.game.getView();
      if (view.phase !== "bidding" || !view.currentPlayerId) return null;
      const bid = view.currentBid;
      return pending(
        `liarsdice:${view.round}:${view.currentPlayerId}:${bid?.quantity}:${bid?.face}`,
        [view.currentPlayerId],
      );
    }
  }
}

/** Plays the cautious default for a player who ran out of time. */
export function playDefault(active: ActiveGame, playerId: string): void {
  switch (active.kind) {
    case "blackjack": {
      const { game } = active;
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
      return;
    }
    case "roulette":
      // Any bets already on the mat stand; with none, this passes the round
      active.game.setReady(playerId);
      return;
    case "baccarat":
      active.game.setReady(playerId);
      return;
    case "poker": {
      const { turn } = active.game.getViewFor(playerId);
      if (turn?.canCheck) active.game.check(playerId);
      else active.game.fold(playerId);
      return;
    }
    case "president": {
      const { game } = active;
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
      return;
    }
    case "liarsdice": {
      const { quantity, face } = smallestRaise(active.game.getView().currentBid);
      active.game.bid(playerId, quantity, face);
      return;
    }
  }
}
