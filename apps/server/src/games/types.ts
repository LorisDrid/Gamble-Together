import type {
  BaccaratGame,
  BlackjackGame,
  ClientToServerEvents,
  GameAck,
  GameKind,
  GameStateView,
  LiarsDiceGame,
  PokerGame,
  PresidentGame,
  RouletteGame,
} from "@gamble/shared";

/** The engine behind each game: the only place the server pairs a kind with a class. */
export interface Engines {
  blackjack: BlackjackGame;
  roulette: RouletteGame;
  poker: PokerGame;
  president: PresidentGame;
  baccarat: BaccaratGame;
  liarsdice: LiarsDiceGame;
}

/** A running game, always paired with its own engine. */
export type ActiveGame = { [K in GameKind]: { kind: K; game: Engines[K] } }[GameKind];

export interface Seat {
  id: string;
  nickname: string;
}

/** A settled round: its number and each participant's net chip change. */
export interface Settlement {
  round: number;
  nets: Array<{ playerId: string; net: number }>;
}

/** Who the table is waiting for right now. */
export interface PendingDecision {
  /** Identifies the situation: the countdown restarts only when this changes. */
  key: string;
  playerIds: string[];
}

/** A game's client events, read from the shared contract (`"poker:fold"`…). */
export type ActionEvent<K extends GameKind> = Extract<keyof ClientToServerEvents, `${K}:${string}`>;

/** An event's arguments, without its trailing acknowledgement callback. */
export type ActionArgs<E extends keyof ClientToServerEvents> =
  Parameters<ClientToServerEvents[E]> extends [...infer Args, (res: GameAck) => void] ? Args : never;

/**
 * Everything the server needs to run one game. Each game describes itself once
 * here; the room manager and the socket server never branch on the game kind.
 */
export interface GameModule<K extends GameKind> {
  kind: K;
  /** Players needed to start it. */
  minPlayers: number;
  /** Builds the engine from the host's settings (untrusted, so clamped). */
  create(seats: Seat[], startingChips: number, input: Record<string, unknown>): Engines[K];

  /** One handler per client event of this game: a missing one fails to compile. */
  actions: {
    [E in ActionEvent<K>]: (game: Engines[K], playerId: string, ...args: ActionArgs<E>) => GameAck;
  };
  /** Actions refused while a tournament runs (rebuys: going broke means elimination). */
  blockedInTournament?: ReadonlyArray<ActionEvent<K>>;

  /** True when players must each get their own view (hidden cards, dice or powers). */
  isPrivate(game: Engines[K]): boolean;
  /** The state sent to `viewerId` ("" for the shared, public view). */
  view(game: Engines[K], viewerId: string): GameStateView;

  /** The round just settled, if any — for stats and tournaments. */
  settlement(game: Engines[K]): Settlement | null;
  /** Each seat's current stack (chips are public in every game). */
  chips(game: Engines[K]): Array<{ id: string; chips: number }>;

  /** Turn timer: who must decide, and what to play for them when time runs out. */
  pendingDecision(game: Engines[K]): PendingDecision | null;
  playDefault(game: Engines[K], playerId: string): void;

  /** Games that chain rounds on their own: how long the result shows, then the next round. */
  autoNextRound?: {
    /** Null when there is no result on screen to move on from. */
    delayMs(game: Engines[K]): number | null;
    advance(game: Engines[K]): void;
  };

  /**
   * Stake escalation for "stake" tournament legs (see TOURNAMENT_LEGS): present
   * exactly for the games whose min bet or blinds can rise.
   */
  tournament?: {
    /** The stake escalation starts from (min bet, or big blind). */
    baseStake(game: Engines[K]): number;
    /** Chips a player needs to stay in the leg. */
    floor(game: Engines[K]): number;
    applyStake(game: Engines[K], base: number, multiplier: number): void;
  };
}
