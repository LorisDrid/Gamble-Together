import { Server } from "socket.io";
import { NICKNAME_MAX_LENGTH } from "@gamble/shared";
import type {
  BlackjackActionResult,
  BlackjackGame,
  ClientToServerEvents,
  GameAck,
  PokerActionResult,
  PokerGame,
  RouletteActionResult,
  RouletteGame,
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
  const broadcast = rooms.gameBroadcast(code);
  if (!broadcast) return;
  if ("shared" in broadcast) {
    io.to(code).emit("game:state", broadcast.shared);
  } else {
    // Poker: hole cards are private, every player gets their own view
    for (const { playerId, view } of broadcast.perPlayer) {
      io.to(playerId).emit("game:state", view);
    }
  }
}

function leaveCurrentRoom(socketId: string): void {
  const left = rooms.leaveRoom(socketId);
  if (left?.room) {
    io.to(left.code).emit("room:state", left.room);
    // A departure can advance the turn, trigger the deal or spin the wheel
    broadcastGame(left.code);
  }
}

io.on("connection", (socket) => {
  const blackjackAction = (
    ack: (res: GameAck) => void,
    act: (game: BlackjackGame, playerId: string) => BlackjackActionResult,
  ): void => {
    const context = rooms.withBlackjack(socket.id);
    if (!context) return ack({ ok: false, error: "NO_GAME" });
    const result = act(context.game, socket.id);
    if (!result.ok) return ack(result);
    broadcastGame(context.code);
    ack({ ok: true });
  };

  const rouletteAction = (
    ack: (res: GameAck) => void,
    act: (game: RouletteGame, playerId: string) => RouletteActionResult,
  ): void => {
    const context = rooms.withRoulette(socket.id);
    if (!context) return ack({ ok: false, error: "NO_GAME" });
    const result = act(context.game, socket.id);
    if (!result.ok) return ack(result);
    broadcastGame(context.code);
    ack({ ok: true });
  };

  const pokerAction = (
    ack: (res: GameAck) => void,
    act: (game: PokerGame, playerId: string) => PokerActionResult,
  ): void => {
    const context = rooms.withPoker(socket.id);
    if (!context) return ack({ ok: false, error: "NO_GAME" });
    const result = act(context.game, socket.id);
    if (!result.ok) return ack(result);
    broadcastGame(context.code);
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

  socket.on("game:start", (payload, ack) => {
    const result = rooms.startGame(socket.id, payload);
    if (!result.ok) return ack({ ok: false, error: result.error });
    io.to(result.code).emit("room:state", result.room);
    broadcastGame(result.code);
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

  socket.on("roulette:bet", (bet, ack) =>
    rouletteAction(ack, (game, playerId) => game.placeBet(playerId, bet)),
  );
  socket.on("roulette:clearBets", (ack) =>
    rouletteAction(ack, (game, playerId) => game.clearBets(playerId)),
  );
  socket.on("roulette:ready", (ack) =>
    rouletteAction(ack, (game, playerId) => game.setReady(playerId)),
  );
  socket.on("roulette:rebuy", (ack) =>
    rouletteAction(ack, (game, playerId) => game.rebuy(playerId)),
  );
  socket.on("roulette:nextRound", (ack) => rouletteAction(ack, (game) => game.nextRound()));

  socket.on("poker:fold", (ack) => pokerAction(ack, (game, playerId) => game.fold(playerId)));
  socket.on("poker:check", (ack) => pokerAction(ack, (game, playerId) => game.check(playerId)));
  socket.on("poker:call", (ack) => pokerAction(ack, (game, playerId) => game.call(playerId)));
  socket.on("poker:raise", (amount, ack) =>
    pokerAction(ack, (game, playerId) => game.raiseTo(playerId, amount)),
  );
  socket.on("poker:nextHand", (ack) => pokerAction(ack, (game) => game.nextHand()));
  socket.on("poker:rebuy", (ack) => pokerAction(ack, (game, playerId) => game.rebuy(playerId)));

  socket.on("disconnect", () => {
    leaveCurrentRoom(socket.id);
  });
});

console.log(`[gamble-together] game server listening on :${PORT} (CORS: ${CORS_ORIGIN})`);
