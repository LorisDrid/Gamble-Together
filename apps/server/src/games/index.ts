import type { GameAck, GameKind, GameStateView } from "@gamble/shared";

import { baccarat } from "./baccarat";
import { blackjack } from "./blackjack";
import { liarsdice } from "./liarsdice";
import { poker } from "./poker";
import { president } from "./president";
import { roulette } from "./roulette";
import type {
  ActiveGame,
  ActionEvent,
  Engines,
  GameModule,
  PendingDecision,
  Seat,
  Settlement,
} from "./types";

export type { ActiveGame, PendingDecision, Seat, Settlement } from "./types";

/**
 * Every game the server can run. A game missing here fails to compile. Listed in
 * tournament leg order, which `TOURNAMENT_ORDER` keeps.
 */
export const GAMES: { [K in GameKind]: GameModule<K> } = {
  blackjack,
  roulette,
  poker,
  president,
  baccarat,
  liarsdice,
};

const KINDS = Object.keys(GAMES) as GameKind[];

/** Games that can be a tournament leg, in the fixed order legs are played. */
export const TOURNAMENT_ORDER: readonly GameKind[] = KINDS.filter((kind) => GAMES[kind].tournament);

/** Every client event a game handles, for the socket server to listen to. */
export const GAME_ACTION_EVENTS: readonly string[] = KINDS.flatMap((kind) =>
  Object.keys(GAMES[kind].actions),
);

const BLOCKED_IN_TOURNAMENT = new Set<string>(
  KINDS.flatMap((kind): readonly string[] => GAMES[kind].blockedInTournament ?? []),
);

export function isGameKind(value: unknown): value is GameKind {
  return typeof value === "string" && Object.hasOwn(GAMES, value);
}

export function isBlockedInTournament(event: string): boolean {
  return BLOCKED_IN_TOURNAMENT.has(event);
}

export function createGame(
  kind: GameKind,
  seats: Seat[],
  startingChips: number,
  input: Record<string, unknown>,
): ActiveGame {
  // `GAMES[kind]` builds the engine of `kind` itself; TS can't see that through the union
  return { kind, game: GAMES[kind].create(seats, startingChips, input) } as ActiveGame;
}

/** A running game with its module bound to it: what the room manager works with. */
export interface RunningGame {
  /** Plays a client event for a player; null when it isn't one of this game's events. */
  act(event: string, playerId: string, args: unknown[]): GameAck | null;
  isPrivate(): boolean;
  view(viewerId: string): GameStateView;
  settlement(): Settlement | null;
  chips(): Array<{ id: string; chips: number }>;
  pendingDecision(): PendingDecision | null;
  playDefault(playerId: string): void;
  autoNextRound?: { delayMs(): number | null; advance(): void };
  tournament?: { baseStake(): number; floor(): number; applyStake(base: number, multiplier: number): void };
}

function bind<K extends GameKind>(module: GameModule<K>, game: Engines[K]): RunningGame {
  const { autoNextRound, tournament } = module;
  return {
    act: (event, playerId, args) => {
      if (!Object.hasOwn(module.actions, event)) return null;
      // socketGuard has checked the message's shape; the engine checks the values
      const action = module.actions[event as ActionEvent<K>] as unknown as (
        game: Engines[K],
        playerId: string,
        ...args: unknown[]
      ) => GameAck;
      return action(game, playerId, ...args);
    },
    isPrivate: () => module.isPrivate(game),
    view: (viewerId) => module.view(game, viewerId),
    settlement: () => module.settlement(game),
    chips: () => module.chips(game),
    pendingDecision: () => module.pendingDecision(game),
    playDefault: (playerId) => module.playDefault(game, playerId),
    autoNextRound: autoNextRound && {
      delayMs: () => autoNextRound.delayMs(game),
      advance: () => autoNextRound.advance(game),
    },
    tournament: tournament && {
      baseStake: () => tournament.baseStake(game),
      floor: () => tournament.floor(game),
      applyStake: (base, multiplier) => tournament.applyStake(game, base, multiplier),
    },
  };
}

/**
 * The module of a running game, bound to its engine. `ActiveGame` always pairs a
 * kind with its own engine, but TS can't follow that link through the union, so
 * this is the one place the server takes it on trust.
 */
export function runningGame(active: ActiveGame): RunningGame {
  const module = GAMES[active.kind] as unknown as GameModule<GameKind>;
  return bind(module, active.game);
}
