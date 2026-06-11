import { MAX_PLAYERS, ROOM_CODE_LENGTH } from "@gamble/shared";
import type { Player, RoomError, RoomState } from "@gamble/shared";

// No I, O, 0, 1 to avoid confusion when sharing codes out loud
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

interface Room {
  code: string;
  /** Keyed by socket id. Insertion order = join order. */
  players: Map<string, Player>;
}

type JoinResult =
  | { ok: true; room: RoomState }
  | { ok: false; error: RoomError };

export class RoomManager {
  private rooms = new Map<string, Room>();
  private roomCodeBySocket = new Map<string, string>();

  createRoom(socketId: string, nickname: string): RoomState {
    const code = this.generateCode();
    const room: Room = { code, players: new Map() };
    room.players.set(socketId, { id: socketId, nickname, isHost: true });
    this.rooms.set(code, room);
    this.roomCodeBySocket.set(socketId, code);
    return toState(room);
  }

  /** Idempotent: joining a room you are already in returns its current state. */
  joinRoom(socketId: string, code: string, nickname: string): JoinResult {
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: "ROOM_NOT_FOUND" };
    if (room.players.has(socketId)) return { ok: true, room: toState(room) };
    if (room.players.size >= MAX_PLAYERS) return { ok: false, error: "ROOM_FULL" };

    room.players.set(socketId, { id: socketId, nickname, isHost: false });
    this.roomCodeBySocket.set(socketId, code);
    return { ok: true, room: toState(room) };
  }

  /**
   * Removes the socket from its room, if any. Promotes a new host when the
   * host leaves, deletes the room when it empties.
   * Returns the updated room state to broadcast, or null if nothing to do.
   */
  leaveRoom(socketId: string): { code: string; room: RoomState | null } | null {
    const code = this.roomCodeBySocket.get(socketId);
    if (!code) return null;
    this.roomCodeBySocket.delete(socketId);

    const room = this.rooms.get(code);
    if (!room) return null;

    const leaving = room.players.get(socketId);
    room.players.delete(socketId);

    if (room.players.size === 0) {
      this.rooms.delete(code);
      return { code, room: null };
    }
    if (leaving?.isHost) {
      const next = room.players.values().next().value;
      if (next) next.isHost = true;
    }
    return { code, room: toState(room) };
  }

  roomCodeOf(socketId: string): string | undefined {
    return this.roomCodeBySocket.get(socketId);
  }

  private generateCode(): string {
    for (;;) {
      let code = "";
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
  }
}

function toState(room: Room): RoomState {
  return {
    code: room.code,
    players: [...room.players.values()],
    maxPlayers: MAX_PLAYERS,
  };
}
