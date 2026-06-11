import type { RoomState } from "./room";

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

/** Events the client emits to the server. */
export interface ClientToServerEvents {
  "room:create": (payload: CreateRoomPayload, ack: (res: RoomAck) => void) => void;
  "room:join": (payload: JoinRoomPayload, ack: (res: RoomAck) => void) => void;
  "room:leave": () => void;
}

/** Events the server emits to clients. */
export interface ServerToClientEvents {
  "room:state": (state: RoomState) => void;
}
