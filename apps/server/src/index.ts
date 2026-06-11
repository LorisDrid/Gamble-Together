import { Server } from "socket.io";
import { NICKNAME_MAX_LENGTH } from "@gamble/shared";
import type {
  BlackjackActionResult,
  BlackjackGame,
  ClientToServerEvents,
  GameAck,
  ServerToClientEvents,
} from "@gamble/shared";

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

function broadcastGame(code: string): void {
  const view = rooms.gameView(code);
  if (view) io.to(code).emit("game:state", view);
}

function leaveCurrentRoom(socketId: string): void {
  const left = rooms.leaveRoom(socketId);
  if (left?.room) {
    io.to(left.code).emit("room:state", left.room);
    // A departure can advance the turn or trigger the deal
    broadcastGame(left.code);
  }
}

io.on("connection", (socket) => {
  const blackjackAction = (
    ack: (res: GameAck) => void,
    act: (game: BlackjackGame, playerId: string) => BlackjackActionResult,
  ): void => {
    const context = rooms.withGame(socket.id);
    if (!context) return ack({ ok: false, error: "NO_GAME" });
    const result = act(context.game, socket.id);
    if (!result.ok) return ack(result);
    io.to(context.code).emit("game:state", context.game.getView());
    ack({ ok: true });
  };

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
    // Late joiners get a seat for the next round; everyone sees them arrive
    broadcastGame(code);
    ack({ ok: true, room: result.room, playerId: socket.id });
  });

  socket.on("room:leave", () => {
    const code = rooms.roomCodeOf(socket.id);
    leaveCurrentRoom(socket.id);
    if (code) void socket.leave(code);
  });

  socket.on("game:start", (settings, ack) => {
    const result = rooms.startGame(socket.id, settings ?? {});
    if (!result.ok) return ack({ ok: false, error: result.error });
    io.to(result.code).emit("room:state", result.room);
    io.to(result.code).emit("game:state", result.view);
    ack({ ok: true });
  });

  socket.on("game:end", () => {
    const result = rooms.endGame(socket.id);
    if (result) io.to(result.code).emit("room:state", result.room);
  });

  socket.on("blackjack:bet", (amount, ack) =>
    blackjackAction(ack, (game, playerId) => game.placeBet(playerId, amount)),
  );
  socket.on("blackjack:hit", (ack) => blackjackAction(ack, (game, playerId) => game.hit(playerId)));
  socket.on("blackjack:stand", (ack) =>
    blackjackAction(ack, (game, playerId) => game.stand(playerId)),
  );
  socket.on("blackjack:rebuy", (ack) =>
    blackjackAction(ack, (game, playerId) => game.rebuy(playerId)),
  );
  socket.on("blackjack:nextRound", (ack) => blackjackAction(ack, (game) => game.nextRound()));

  socket.on("disconnect", () => {
    leaveCurrentRoom(socket.id);
  });
});

console.log(`[gamble-together] game server listening on :${PORT} (CORS: ${CORS_ORIGIN})`);
