import { runningGame, type ActiveGame, type PendingDecision } from "../games";

export type { PendingDecision } from "../games";

/**
 * The decision holding up the game, if any. Each game module defines it (see
 * `pendingDecision` in apps/server/src/games/<game>.ts): only what a single
 * absent player can block counts, never "next round" buttons, and parallel-play
 * games share one countdown per phase.
 */
export function pendingDecision(active: ActiveGame): PendingDecision | null {
  return runningGame(active).pendingDecision();
}

/** Plays the game module's cautious default for a player who ran out of time. */
export function playDefault(active: ActiveGame, playerId: string): void {
  runningGame(active).playDefault(playerId);
}
