export const MAX_PLAYERS = 6;
export const NICKNAME_MAX_LENGTH = 20;
export const ROOM_CODE_LENGTH = 4;

export interface Player {
  id: string;
  nickname: string;
  isHost: boolean;
}

export interface RoomState {
  code: string;
  players: Player[];
  maxPlayers: number;
}
