import { createServer } from "node:http";
import { Server } from "socket.io";
import { NICKNAME_MAX_LENGTH } from "@gamble/shared";
import type {
  ClientToServerEvents,
  GameAck,
  RoomState,
  ServerToClientEvents,
} from "@gamble/shared";

import { GAME_ACTION_EVENTS } from "./games";
import { RoomManager } from "./rooms/roomManager";
import { getLeaderboard, isValidToken, recordRound, syncProfile } from "./db";
import { isWellFormed } from "./socketGuard";

const LEADERBOARD_SIZE = 10;

const PORT = Number(process.env.PORT ?? 3001);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:3000";

// Plain HTTP server so a health endpoint lives alongside Socket.io. GET/HEAD /
// and /healthz return 200 — a cheap target for the uptime pinger that keeps the
// free-tier instance awake (and avoids false "down" alerts from hitting the
// Socket.io path directly). HEAD matters: UptimeRobot's free plan pings with
// HEAD and can't be switched to GET. Node omits the body for HEAD on its own.
const httpServer = createServer((req, res) => {
  if (
    (req.method === "GET" || req.method === "HEAD") &&
    (req.url === "/" || req.url === "/healthz")
  ) {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: CORS_ORIGIN },
});

httpServer.listen(PORT);

const rooms = new RoomManager();

// Persistent guest stats: socket → device token, and the last settled round we
// folded into stats per room (so each round counts at most once).
const socketToken = new Map<string, string>();
const recordedRound = new Map<string, number>();

/**
 * Fold a freshly-settled round into persistent stats. Returns the settled round
 * number when this is a NEW settlement (so callers can drive round-based logic),
 * or null otherwise.
 */
function settleAndRecord(code: string): number | null {
  const settled = rooms.settlement(code);
  if (!settled) return null;
  if ((recordedRound.get(code) ?? 0) >= settled.round) return null;
  recordedRound.set(code, settled.round);
  for (const { playerId, net } of settled.nets) {
    recordRound(rooms.tokenOf(code, playerId), net);
  }
  return settled.round;
}

// Games that chain rounds on their own (blackjack): the pending "next round" per room.
const nextRoundTimers = new Map<string, NodeJS.Timeout>();
// Tournament intermission between legs (shows the standings before the next game).
const INTERMISSION_MS = 5000;
const tournamentTimers = new Map<string, NodeJS.Timeout>();
// A dropped player keeps their seat this long. Detecting a dead connection already
// takes the server 25-45 s, so this leaves time to unlock a phone and come back.
const RECONNECT_GRACE_MS = 2 * 60 * 1000;
const graceTimers = new Map<string, NodeJS.Timeout>();
// The decision countdown per room. `key` is the situation it was started for.
const turnTimers = new Map<string, { key: string; deadline: number; timer: NodeJS.Timeout }>();

function clearGraceTimer(playerId: string): void {
  const timer = graceTimers.get(playerId);
  if (timer) {
    clearTimeout(timer);
    graceTimers.delete(playerId);
  }
}

function clearTurnTimer(code: string): void {
  const running = turnTimers.get(code);
  if (running) {
    clearTimeout(running.timer);
    turnTimers.delete(code);
  }
}

/**
 * Aligns the countdown with the game: restarts it when the table starts waiting
 * for a new decision, stops it when nobody is awaited, and tells the clients.
 */
function syncTurnTimer(code: string): void {
  const decision = rooms.turnDecision(code);
  if (!decision) {
    clearTurnTimer(code);
    io.to(code).emit("turn:timer", null);
    return;
  }
  let running = turnTimers.get(code);
  if (running?.key !== decision.key) {
    clearTurnTimer(code);
    running = {
      key: decision.key,
      deadline: Date.now() + decision.durationMs,
      timer: setTimeout(() => {
        turnTimers.delete(code);
        rooms.playTurnDefaults(code);
        broadcastGame(code);
        progressAfterSettle(code);
      }, decision.durationMs),
    };
    turnTimers.set(code, running);
  }
  io.to(code).emit("turn:timer", {
    remainingMs: running.deadline - Date.now(),
    playerIds: decision.playerIds,
  });
}

function clearNextRoundTimer(code: string): void {
  const timer = nextRoundTimers.get(code);
  if (timer) {
    clearTimeout(timer);
    nextRoundTimers.delete(code);
  }
}

function clearTournamentTimer(code: string): void {
  const timer = tournamentTimers.get(code);
  if (timer) {
    clearTimeout(timer);
    tournamentTimers.delete(code);
  }
}

function broadcastTournament(code: string): void {
  io.to(code).emit("tournament:state", rooms.tournamentView(code));
}

/** When a self-chaining game shows a result, schedule its next round. */
function maybeScheduleNextRound(code: string): void {
  const delay = rooms.autoNextRoundDelay(code);
  if (delay === null) return;
  clearNextRoundTimer(code);
  nextRoundTimers.set(
    code,
    setTimeout(() => {
      nextRoundTimers.delete(code);
      if (rooms.advanceRound(code)) broadcastGame(code);
    }, delay),
  );
}

/**
 * Called after any action that may have settled a round. Records stats and, if a
 * tournament is running, ends the leg once it hits its round count — otherwise
 * lets the game continue (blackjack auto-advances within a leg).
 */
function progressAfterSettle(code: string): void {
  const settledRound = settleAndRecord(code);
  if (settledRound === null) return;
  if (rooms.tournamentActive(code)) {
    const result = rooms.tournamentAfterRound(code, settledRound);
    if (result?.endLeg) {
      finishLeg(code);
      return;
    }
    // Escalation may have raised stakes / knocked players out — refresh both views
    broadcastGame(code);
    broadcastTournament(code);
    maybeScheduleNextRound(code);
    return;
  }
  maybeScheduleNextRound(code);
}

/** End the current leg (award the point), then schedule the next leg or finish. */
function finishLeg(code: string): void {
  clearNextRoundTimer(code);
  const result = rooms.endTournamentLeg(code);
  if (!result) return;
  recordedRound.delete(code);
  emitRoom(code);
  syncTurnTimer(code);
  broadcastTournament(code); // game is null now → clients show the intermission/final overlay
  if (result.phase === "intermission") {
    clearTournamentTimer(code);
    tournamentTimers.set(
      code,
      setTimeout(() => {
        tournamentTimers.delete(code);
        startNextLeg(code);
      }, INTERMISSION_MS),
    );
  }
}

function startNextLeg(code: string): void {
  if (!rooms.startTournamentLeg(code)) {
    // Players left during the intermission and no remaining leg can be played:
    // the tournament may just have ended, so show the final standings
    broadcastTournament(code);
    return;
  }
  recordedRound.delete(code);
  emitRoom(code);
  broadcastGame(code);
  broadcastTournament(code);
}

function emitRoom(code: string): void {
  const state = rooms.roomStateByCode(code);
  if (state) io.to(code).emit("room:state", state);
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
  syncTurnTimer(code);
}

/** Unsubscribes a socket from a seat's channels (the room and its private views). */
function unsubscribeSeat(socketId: string, code: string, playerId: string): void {
  const socket = io.sockets.sockets.get(socketId);
  void socket?.leave(code);
  void socket?.leave(playerId);
}

function leaveCurrentRoom(socketId: string): void {
  const code = rooms.roomCodeOf(socketId);
  const playerId = rooms.playerIdOf(socketId);
  if (code && playerId) unsubscribeSeat(socketId, code, playerId);
  afterDeparture(rooms.leaveRoom(socketId));
}

/** A seat was freed for good: update the table and clean up if the room emptied. */
function afterDeparture(left: { code: string; room: RoomState | null } | null): void {
  if (!left) return;
  if (left.room) {
    io.to(left.code).emit("room:state", left.room);
    // A departure can trigger the deal, settle the round or spin the wheel
    broadcastGame(left.code);
    broadcastTournament(left.code);
    progressAfterSettle(left.code);
  } else {
    // Room emptied — drop any pending timers and stats cursor for it
    clearNextRoundTimer(left.code);
    clearTournamentTimer(left.code);
    clearTurnTimer(left.code);
    recordedRound.delete(left.code);
  }
}

// Rooms live in this process's memory, so a crash ends every table at once. An
// unexpected error in one handler is logged instead; at worst one room is left
// in an odd state, which beats wiping them all.
process.on("uncaughtException", (error) => {
  console.error("[gamble-together] unexpected error, server kept running:", error);
});
process.on("unhandledRejection", (reason) => {
  console.error("[gamble-together] unhandled rejection, server kept running:", reason);
});

io.on("connection", (socket) => {
  // Any client can send anything: drop malformed messages (unknown event, missing
  // or misplaced callback) before a handler tries to answer them.
  socket.use(([event, ...args], next) => {
    if (isWellFormed(event, args)) next();
  });

  // Sent with the handshake, so it's known before any room event. Without a valid
  // one the player can't reclaim a seat: they sit down normally, with no grace period.
  const handshakeToken: unknown = socket.handshake.auth?.token;
  const deviceToken = isValidToken(handshakeToken) ? handshakeToken : null;

  // Every game action: play it for this socket's seat, then share the new state
  // and fold a settled round into stats / the tournament.
  const gameAction = (event: string, args: unknown[], ack: (res: GameAck) => void): void => {
    const { code, result } = rooms.act(socket.id, event, args);
    if (!result.ok || !code) return ack(result);
    broadcastGame(code);
    progressAfterSettle(code);
    ack({ ok: true });
  };

  // Socket.io's typed `on` can't check event names that come from the game
  // modules; socketGuard has already checked the message shape (callback last).
  const onGameEvent = socket.on.bind(socket) as unknown as (
    event: string,
    listener: (...args: unknown[]) => void,
  ) => void;
  for (const event of GAME_ACTION_EVENTS) {
    onGameEvent(event, (...args) => {
      const ack = args.pop() as (res: GameAck) => void;
      gameAction(event, args, ack);
    });
  }

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
    const room = rooms.createRoom(socket.id, nickname, deviceToken);
    void socket.join(room.code);
    void socket.join(socket.id); // a previous departure may have unsubscribed it
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
    const result = rooms.joinRoom(socket.id, code, nickname, deviceToken);
    if (!result.ok) return ack(result);

    clearGraceTimer(result.playerId);
    if (result.replacedSocketId) {
      // Retire the old socket for good: its id may be this seat's player id, so it
      // must never receive this seat's views or sit down elsewhere under that id.
      const replaced = io.sockets.sockets.get(result.replacedSocketId);
      replaced?.emit("session:replaced");
      replaced?.disconnect(true);
    }
    void socket.join(code);
    // Private views go to the player id, which outlives any single socket
    void socket.join(result.playerId);
    socket.to(code).emit("room:state", result.room);
    // Late joiners get a seat for the next round; everyone sees them arrive.
    // A returning player gets their current game state here too.
    broadcastGame(code);
    // Send the tournament overlay to the joiner specifically (it may be running)
    socket.emit("tournament:state", rooms.tournamentView(code));
    ack({ ok: true, room: result.room, playerId: result.playerId });
  });

  socket.on("room:theme", (theme, ack) => {
    const result = rooms.setTableTheme(socket.id, theme);
    if (!result.ok) return ack({ ok: false, error: result.error });
    io.to(result.code).emit("room:state", result.room);
    ack({ ok: true });
  });

  socket.on("room:turnTimer", (seconds, ack) => {
    const result = rooms.setTurnTimer(socket.id, seconds);
    if (!result.ok) return ack({ ok: false, error: result.error });
    io.to(result.code).emit("room:state", result.room);
    syncTurnTimer(result.code);
    ack({ ok: true });
  });

  socket.on("room:leave", () => leaveCurrentRoom(socket.id));

  socket.on("game:start", (payload, ack) => {
    const result = rooms.startGame(socket.id, payload);
    if (!result.ok) return ack({ ok: false, error: result.error });
    // Fresh game → reset the per-room stats cursor (round numbers restart)
    recordedRound.delete(result.code);
    io.to(result.code).emit("room:state", result.room);
    broadcastGame(result.code);
    ack({ ok: true });
  });

  socket.on("tournament:start", (settings, ack) => {
    const result = rooms.startTournament(socket.id, settings);
    if (!result.ok) return ack({ ok: false, error: result.error });
    recordedRound.delete(result.code);
    io.to(result.code).emit("room:state", result.room);
    broadcastGame(result.code);
    broadcastTournament(result.code);
    ack({ ok: true });
  });

  socket.on("game:end", () => {
    const result = rooms.endGame(socket.id);
    if (result) {
      clearNextRoundTimer(result.code);
      clearTournamentTimer(result.code);
      recordedRound.delete(result.code);
      io.to(result.code).emit("room:state", result.room);
      syncTurnTimer(result.code);
      broadcastTournament(result.code); // emits null → clears the overlay
    }
  });

  socket.on("disconnect", () => {
    socketToken.delete(socket.id);
    if (!deviceToken) return leaveCurrentRoom(socket.id);

    const dropped = rooms.markDisconnected(socket.id);
    if (!dropped) return;
    const { code, playerId, room } = dropped;
    io.to(code).emit("room:state", room);
    clearGraceTimer(playerId);
    graceTimers.set(
      playerId,
      setTimeout(() => {
        graceTimers.delete(playerId);
        afterDeparture(rooms.expireSeat(code, playerId));
      }, RECONNECT_GRACE_MS),
    );
  });
});

console.log(`[gamble-together] game server listening on :${PORT} (CORS: ${CORS_ORIGIN})`);
