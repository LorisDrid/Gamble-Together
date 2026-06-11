import type { RoomState } from "./room";
import type { BlackjackError } from "../games/blackjack/game";
import type { BlackjackSettings, BlackjackView } from "../games/blackjack/types";
import type { RouletteError } from "../games/roulette/game";
import type { RouletteBet, RouletteSettings, RouletteView } from "../games/roulette/types";

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
  | RouletteError
  | "NO_ROOM"
  | "NO_GAME"
  | "NOT_HOST"
  | "GAME_IN_PROGRESS";

export type GameAck = { ok: true } | { ok: false; error: GameAckError };

export type GameStartPayload =
  | { game: "blackjack"; settings: Partial<BlackjackSettings> }
  | { game: "roulette"; settings: Partial<RouletteSettings> };

/** Tagged game state so clients render the right table. */
export type GameStateView =
  | { game: "blackjack"; view: BlackjackView }
  | { game: "roulette"; view: RouletteView };

/** Events the client emits to the server. */
export interface ClientToServerEvents {
  "room:create": (payload: CreateRoomPayload, ack: (res: RoomAck) => void) => void;
  "room:join": (payload: JoinRoomPayload, ack: (res: RoomAck) => void) => void;
  "room:leave": () => void;
  /** Host only: starts a game with the table settings. */
  "game:start": (payload: GameStartPayload, ack: (res: GameAck) => void) => void;
  /** Host only: ends the game and returns the table to the lobby. */
  "game:end": () => void;
  "blackjack:bet": (amount: number, ack: (res: GameAck) => void) => void;
  "blackjack:hit": (ack: (res: GameAck) => void) => void;
  "blackjack:stand": (ack: (res: GameAck) => void) => void;
  "blackjack:rebuy": (ack: (res: GameAck) => void) => void;
  "blackjack:nextRound": (ack: (res: GameAck) => void) => void;
  "roulette:bet": (bet: RouletteBet, ack: (res: GameAck) => void) => void;
  "roulette:clearBets": (ack: (res: GameAck) => void) => void;
  "roulette:ready": (ack: (res: GameAck) => void) => void;
  "roulette:rebuy": (ack: (res: GameAck) => void) => void;
  "roulette:nextRound": (ack: (res: GameAck) => void) => void;
}

/** Events the server emits to clients. */
export interface ServerToClientEvents {
  "room:state": (state: RoomState) => void;
  "game:state": (state: GameStateView) => void;
}
