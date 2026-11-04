export const MAX_PLAYERS = 6;
export const NICKNAME_MAX_LENGTH = 20;
export const ROOM_CODE_LENGTH = 4;

export const TABLE_THEMES = ["wine", "forest", "night"] as const;
export type TableTheme = (typeof TABLE_THEMES)[number];

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
  code: string;
  players: Player[];
  maxPlayers: number;
  /** The mini-game in play (a tournament leg counts here too), or null in the lobby. */
  activeGame: GameKind | null;
  /** True while a tournament is running (stays true through intermissions). */
  tournamentActive: boolean;
}
