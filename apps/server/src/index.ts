import { Server } from "socket.io";
import { NICKNAME_MAX_LENGTH } from "@gamble/shared";
import type { ClientToServerEvents, ServerToClientEvents } from "@gamble/shared";

import { RoomManager } from "./rooms/roomManager";

const PORT = Number(process.env.PORT ?? 3001);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:3000";

const io = new Server<ClientToServerEvents, ServerToClientEvents>(PORT, {
  cors: { origin: CORS_ORIGIN },
});

const rooms = new RoomManager();

function sanitizeNickname(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const nickname = raw.trim().slice(0, NICKNAME_MAX_LENGTH);
  return nickname.length > 0 ? nickname : null;
}

function leaveCurrentRoom(socketId: string): void {
  const left = rooms.leaveRoom(socketId);
  if (left?.room) {
    io.to(left.code).emit("room:state", left.room);
  }
}

io.on("connection", (socket) => {
  socket.on("room:create", (payload, ack) => {
    const nickname = sanitizeNickname(payload?.nickname);
    if (!nickname) return ack({ ok: false, error: "INVALID_NICKNAME" });

    leaveCurrentRoom(socket.id);
    const room = rooms.createRoom(socket.id, nickname);
    void socket.join(room.code);
    ack({ ok: true, room, playerId: socket.id });
  });

  socket.on("room:join", (payload, ack) => {
    const nickname = sanitizeNickname(payload?.nickname);
    if (!nickname) return ack({ ok: false, error: "INVALID_NICKNAME" });
    const code = typeof payload?.code === "string" ? payload.code.trim().toUpperCase() : "";

    // Joining the room you are already in is a no-op refresh, not a move
    if (rooms.roomCodeOf(socket.id) !== code) {
      leaveCurrentRoom(socket.id);
    }
    const result = rooms.joinRoom(socket.id, code, nickname);
    if (!result.ok) return ack(result);

    void socket.join(code);
    socket.to(code).emit("room:state", result.room);
    ack({ ok: true, room: result.room, playerId: socket.id });
  });

  socket.on("room:leave", () => {
    const code = rooms.roomCodeOf(socket.id);
    leaveCurrentRoom(socket.id);
    if (code) void socket.leave(code);
  });

  socket.on("disconnect", () => {
    leaveCurrentRoom(socket.id);
  });
});

console.log(`[gamble-together] game server listening on :${PORT} (CORS: ${CORS_ORIGIN})`);
