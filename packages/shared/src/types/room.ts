export const MAX_PLAYERS = 6;
export const NICKNAME_MAX_LENGTH = 20;
export const ROOM_CODE_LENGTH = 4;

export const TABLE_THEMES = ["wine", "forest", "night"] as const;
export type TableTheme = (typeof TABLE_THEMES)[number];

/** Seconds to decide before the server plays a default action (0 = no limit). */
export const TURN_TIMER_OPTIONS = [0, 30, 60, 90] as const;
export type TurnTimerSeconds = (typeof TURN_TIMER_OPTIONS)[number];
export const DEFAULT_TURN_TIMER: TurnTimerSeconds = 60;

/** A running decision countdown. A duration, not a date: clocks differ across devices. */
export interface TurnTimerView {
  remainingMs: number;
  /** Who the table is waiting for: one player, or several in parallel-play games. */
  playerIds: string[];
}

export interface Player {
  id: string;
  nickname: string;
  isHost: boolean;
  /** False while the player's connection is lost and their seat is held for them. */
  connected: boolean;
}

export type GameKind =
  | "blackjack"
  | "roulette"
  | "poker"
  | "president"
  | "baccarat"
  | "liarsdice";

export interface RoomState {
  tableTheme: TableTheme;
  turnTimer: TurnTimerSeconds;
  code: string;
  players: Player[];
  maxPlayers: number;
  /** The mini-game in play (a tournament leg counts here too), or null in the lobby. */
  activeGame: GameKind | null;
  /** True while a tournament is running (stays true through intermissions). */
  tournamentActive: boolean;
}
