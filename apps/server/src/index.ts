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
import { getLeaderboard, recordRound, syncProfile } from "./db";

const LEADERBOARD_SIZE = 10;

const PORT = Number(process.env.PORT ?? 3001);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:3000";

const io = new Server<ClientToServerEvents, ServerToClientEvents>(PORT, {
  cors: { origin: CORS_ORIGIN },
});

const rooms = new RoomManager();

// Persistent guest stats: socket → device token, and the last settled round we
// folded into stats per room (so each round counts at most once).
const socketToken = new Map<string, string>();
const recordedRound = new Map<string, number>();

/** Fold a freshly-settled round's per-player nets into persistent stats, once. */
function recordSettlement(code: string): void {
  const settled = rooms.settlement(code);
  if (!settled) return;
  if ((recordedRound.get(code) ?? 0) >= settled.round) return;
  recordedRound.set(code, settled.round);
  for (const { playerId, net } of settled.nets) {
    recordRound(socketToken.get(playerId), net);
  }
}

// Blackjack rounds chain automatically: after the payout is shown for a beat,
// the table resets to betting on its own (no "next round" button).
const NEXT_ROUND_DELAY_MS = 4000;
const blackjackTimers = new Map<string, NodeJS.Timeout>();

function clearBlackjackTimer(code: string): void {
  const timer = blackjackTimers.get(code);
  if (timer) {
    clearTimeout(timer);
    blackjackTimers.delete(code);
  }
}

/** When a blackjack table reaches payout, schedule the automatic next round. */
function maybeScheduleNextRound(code: string): void {
  const game = rooms.blackjackByCode(code);
  if (!game || game.getView().phase !== "payout") return;
  clearBlackjackTimer(code);
  blackjackTimers.set(
    code,
    setTimeout(() => {
      blackjackTimers.delete(code);
      const current = rooms.blackjackByCode(code);
      if (current && current.getView().phase === "payout") {
        current.nextRound();
        broadcastGame(code);
      }
    }, NEXT_ROUND_DELAY_MS),
  );
}

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
  if (!left) return;
  if (left.room) {
    io.to(left.code).emit("room:state", left.room);
    // A departure can trigger the deal, settle the round or spin the wheel
    broadcastGame(left.code);
    recordSettlement(left.code);
    maybeScheduleNextRound(left.code);
  } else {
    // Room emptied — drop any pending auto-advance and stats cursor for it
    clearBlackjackTimer(left.code);
    recordedRound.delete(left.code);
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
    recordSettlement(context.code);
    maybeScheduleNextRound(context.code);
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
    recordSettlement(context.code);
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
    recordSettlement(context.code);
    ack({ ok: true });
  };

  socket.on("profile:sync", (payload, ack) => {
    const profile = syncProfile(payload?.token, payload?.nickname);
    if (profile && typeof payload?.token === "string") {
      socketToken.set(socket.id, payload.token);
    }
    ack(profile);
  });

  socket.on("leaderboard:get", (metric, ack) => {
    ack(getLeaderboard(metric, LEADERBOARD_SIZE, socketToken.get(socket.id)));
  });

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
    // Fresh game → reset the per-room stats cursor (round numbers restart)
    recordedRound.delete(result.code);
    io.to(result.code).emit("room:state", result.room);
    broadcastGame(result.code);
    ack({ ok: true });
  });

  socket.on("game:end", () => {
    const result = rooms.endGame(socket.id);
    if (result) {
      clearBlackjackTimer(result.code);
      recordedRound.delete(result.code);
      io.to(result.code).emit("room:state", result.room);
    }
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
    socketToken.delete(socket.id);
  });
});

console.log(`[gamble-together] game server listening on :${PORT} (CORS: ${CORS_ORIGIN})`);
