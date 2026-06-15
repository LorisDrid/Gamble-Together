export const MAX_PLAYERS = 6;
export const NICKNAME_MAX_LENGTH = 20;
export const ROOM_CODE_LENGTH = 4;

export interface Player {
  id: string;
  nickname: string;
  isHost: boolean;
}

export type GameKind = "blackjack" | "roulette" | "poker" | "president";

export interface RoomState {
  code: string;
  players: Player[];
  maxPlayers: number;
  /** The mini-game in play (a tournament leg counts here too), or null in the lobby. */
  activeGame: GameKind | null;
  /** True while a tournament is running (stays true through intermissions). */
  tournamentActive: boolean;
}
