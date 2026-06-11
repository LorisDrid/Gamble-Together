import type { RoomState } from "./room";
import type { BlackjackError } from "../games/blackjack/game";
import type { BlackjackSettings, BlackjackView } from "../games/blackjack/types";

export type RoomError = "ROOM_NOT_FOUND" | "ROOM_FULL" | "INVALID_NICKNAME";

export interface CreateRoomPayload {
  nickname: string;
}

export interface JoinRoomPayload {
  code: string;
  nickname: string;
}

export type RoomAck =
  | { ok: true; room: RoomState; playerId: string }
  | { ok: false; error: RoomError };

export type GameAckError =
  | BlackjackError
  | "NO_ROOM"
  | "NO_GAME"
  | "NOT_HOST"
  | "GAME_IN_PROGRESS";

export type GameAck = { ok: true } | { ok: false; error: GameAckError };

/** Events the client emits to the server. */
export interface ClientToServerEvents {
  "room:create": (payload: CreateRoomPayload, ack: (res: RoomAck) => void) => void;
  "room:join": (payload: JoinRoomPayload, ack: (res: RoomAck) => void) => void;
  "room:leave": () => void;
  /** Host only: starts a blackjack game with the table settings. */
  "game:start": (settings: Partial<BlackjackSettings>, ack: (res: GameAck) => void) => void;
  /** Host only: ends the game and returns the table to the lobby. */
  "game:end": () => void;
  "blackjack:bet": (amount: number, ack: (res: GameAck) => void) => void;
  "blackjack:hit": (ack: (res: GameAck) => void) => void;
  "blackjack:stand": (ack: (res: GameAck) => void) => void;
  "blackjack:rebuy": (ack: (res: GameAck) => void) => void;
  "blackjack:nextRound": (ack: (res: GameAck) => void) => void;
}

/** Events the server emits to clients. */
export interface ServerToClientEvents {
  "room:state": (state: RoomState) => void;
  "game:state": (view: BlackjackView) => void;
}
