import { Server } from "socket.io";
import { BLACKJACK_DEALER_REVEAL_MS, NICKNAME_MAX_LENGTH } from "@gamble/shared";
import type {
  BaccaratActionResult,
  BaccaratGame,
  BlackjackActionResult,
  BlackjackGame,
  ClientToServerEvents,
  GameAck,
  PokerActionResult,
  PokerGame,
  PresidentActionResult,
  PresidentGame,
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
    recordRound(socketToken.get(playerId), net);
  }
  return settled.round;
}

// Blackjack rounds chain automatically: after the payout is shown for a beat,
// the table resets to betting on its own (no "next round" button).
const NEXT_ROUND_DELAY_MS = 4000;
const blackjackTimers = new Map<string, NodeJS.Timeout>();
// Tournament intermission between legs (shows the standings before the next game).
const INTERMISSION_MS = 5000;
const tournamentTimers = new Map<string, NodeJS.Timeout>();

function clearBlackjackTimer(code: string): void {
  const timer = blackjackTimers.get(code);
  if (timer) {
    clearTimeout(timer);
    blackjackTimers.delete(code);
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

/** When a blackjack table reaches payout, schedule the automatic next round. */
function maybeScheduleNextRound(code: string): void {
  const game = rooms.blackjackByCode(code);
  if (!game || game.getView().phase !== "payout") return;
  clearBlackjackTimer(code);
  // Give the client time to reveal the dealer's drawn cards one by one before the
  // verdict, then keep the base delay so the result lingers (see BLACKJACK_DEALER_REVEAL_MS).
  const drawnCards = Math.max(0, game.getView().dealerHand.length - 2);
  const delay = NEXT_ROUND_DELAY_MS + drawnCards * BLACKJACK_DEALER_REVEAL_MS;
  blackjackTimers.set(
    code,
    setTimeout(() => {
      blackjackTimers.delete(code);
      const current = rooms.blackjackByCode(code);
      if (current && current.getView().phase === "payout") {
        current.nextRound();
        broadcastGame(code);
      }
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
  clearBlackjackTimer(code);
  const result = rooms.endTournamentLeg(code);
  if (!result) return;
  recordedRound.delete(code);
  emitRoom(code);
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
  if (!rooms.startTournamentLeg(code)) return;
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
}

function leaveCurrentRoom(socketId: string): void {
  const left = rooms.leaveRoom(socketId);
  if (!left) return;
  if (left.room) {
    io.to(left.code).emit("room:state", left.room);
    // A departure can trigger the deal, settle the round or spin the wheel
    broadcastGame(left.code);
    broadcastTournament(left.code);
    progressAfterSettle(left.code);
  } else {
    // Room emptied — drop any pending timers and stats cursor for it
    clearBlackjackTimer(left.code);
    clearTournamentTimer(left.code);
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
    progressAfterSettle(context.code);
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
    progressAfterSettle(context.code);
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
    progressAfterSettle(context.code);
    ack({ ok: true });
  };

  const presidentAction = (
    ack: (res: GameAck) => void,
    act: (game: PresidentGame, playerId: string) => PresidentActionResult,
  ): void => {
    const context = rooms.withPresident(socket.id);
    if (!context) return ack({ ok: false, error: "NO_GAME" });
    const result = act(context.game, socket.id);
    if (!result.ok) return ack(result);
    broadcastGame(context.code);
    progressAfterSettle(context.code);
    ack({ ok: true });
  };

  const baccaratAction = (
    ack: (res: GameAck) => void,
    act: (game: BaccaratGame, playerId: string) => BaccaratActionResult,
  ): void => {
    const context = rooms.withBaccarat(socket.id);
    if (!context) return ack({ ok: false, error: "NO_GAME" });
    const result = act(context.game, socket.id);
    if (!result.ok) return ack(result);
    broadcastGame(context.code);
    progressAfterSettle(context.code);
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
    // Send the tournament overlay to the joiner specifically (it may be running)
    socket.emit("tournament:state", rooms.tournamentView(code));
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
      clearBlackjackTimer(result.code);
      clearTournamentTimer(result.code);
      recordedRound.delete(result.code);
      io.to(result.code).emit("room:state", result.room);
      broadcastTournament(result.code); // emits null → clears the overlay
    }
  });

  socket.on("blackjack:bet", (amount, ack) =>
    blackjackAction(ack, (game, playerId) => game.placeBet(playerId, amount)),
  );
  socket.on("blackjack:hit", (ack) => blackjackAction(ack, (game, playerId) => game.hit(playerId)));
  socket.on("blackjack:stand", (ack) =>
    blackjackAction(ack, (game, playerId) => game.stand(playerId)),
  );
  // Rebuy is disabled during tournaments (going broke = elimination)
  const rebuyBlocked = (ack: (res: GameAck) => void): boolean => {
    const code = rooms.roomCodeOf(socket.id);
    if (code && rooms.tournamentActive(code)) {
      ack({ ok: false, error: "CANNOT_REBUY" });
      return true;
    }
    return false;
  };

  socket.on("blackjack:rebuy", (ack) => {
    if (rebuyBlocked(ack)) return;
    blackjackAction(ack, (game, playerId) => game.rebuy(playerId));
  });
  socket.on("blackjack:nextRound", (ack) => blackjackAction(ack, (game) => game.nextRound()));
  socket.on("blackjack:power", (power, ack) =>
    blackjackAction(ack, (game, playerId) => game.usePower(playerId, power)),
  );
  socket.on("blackjack:skipPower", (ack) =>
    blackjackAction(ack, (game, playerId) => game.skipPower(playerId)),
  );

  socket.on("roulette:bet", (bet, ack) =>
    rouletteAction(ack, (game, playerId) => game.placeBet(playerId, bet)),
  );
  socket.on("roulette:clearBets", (ack) =>
    rouletteAction(ack, (game, playerId) => game.clearBets(playerId)),
  );
  socket.on("roulette:ready", (ack) =>
    rouletteAction(ack, (game, playerId) => game.setReady(playerId)),
  );
  socket.on("roulette:rebuy", (ack) => {
    if (rebuyBlocked(ack)) return;
    rouletteAction(ack, (game, playerId) => game.rebuy(playerId));
  });
  socket.on("roulette:nextRound", (ack) => rouletteAction(ack, (game) => game.nextRound()));

  socket.on("poker:fold", (ack) => pokerAction(ack, (game, playerId) => game.fold(playerId)));
  socket.on("poker:check", (ack) => pokerAction(ack, (game, playerId) => game.check(playerId)));
  socket.on("poker:call", (ack) => pokerAction(ack, (game, playerId) => game.call(playerId)));
  socket.on("poker:raise", (amount, ack) =>
    pokerAction(ack, (game, playerId) => game.raiseTo(playerId, amount)),
  );
  socket.on("poker:nextHand", (ack) => pokerAction(ack, (game) => game.nextHand()));
  socket.on("poker:rebuy", (ack) => {
    if (rebuyBlocked(ack)) return;
    pokerAction(ack, (game, playerId) => game.rebuy(playerId));
  });

  socket.on("president:play", (cards, ack) =>
    presidentAction(ack, (game, playerId) => game.play(playerId, cards)),
  );
  socket.on("president:pass", (ack) =>
    presidentAction(ack, (game, playerId) => game.pass(playerId)),
  );
  socket.on("president:exchange", (cards, ack) =>
    presidentAction(ack, (game, playerId) => game.exchangeReturn(playerId, cards)),
  );
  socket.on("president:nextRound", (ack) => presidentAction(ack, (game) => game.nextRound()));

  socket.on("baccarat:bet", (bet, ack) =>
    baccaratAction(ack, (game, playerId) => game.placeBet(playerId, bet)),
  );
  socket.on("baccarat:clearBets", (ack) =>
    baccaratAction(ack, (game, playerId) => game.clearBets(playerId)),
  );
  socket.on("baccarat:ready", (ack) =>
    baccaratAction(ack, (game, playerId) => game.setReady(playerId)),
  );
  socket.on("baccarat:rebuy", (ack) => {
    if (rebuyBlocked(ack)) return;
    baccaratAction(ack, (game, playerId) => game.rebuy(playerId));
  });
  socket.on("baccarat:nextRound", (ack) => baccaratAction(ack, (game) => game.nextRound()));

  socket.on("disconnect", () => {
    leaveCurrentRoom(socket.id);
    socketToken.delete(socket.id);
  });
});

console.log(`[gamble-together] game server listening on :${PORT} (CORS: ${CORS_ORIGIN})`);
