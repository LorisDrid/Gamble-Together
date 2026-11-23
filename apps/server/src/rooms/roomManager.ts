import {
  DEFAULT_TURN_TIMER,
  MAX_PLAYERS,
  MIN_TOURNAMENT_GAMES,
  ROOM_CODE_LENGTH,
  TABLE_THEMES,
  TURN_TIMER_OPTIONS,
} from "@gamble/shared";
import type {
  GameAck,
  GameAckError,
  GameKind,
  GameStartPayload,
  GameStateView,
  Player,
  RoomError,
  RoomState,
  TableTheme,
  TournamentSettings,
  TournamentView,
  TurnTimerSeconds,
} from "@gamble/shared";

import {
  GAMES,
  TOURNAMENT_ORDER,
  createGame,
  isBlockedInTournament,
  isGameKind,
  runningGame,
  type ActiveGame,
  type PendingDecision,
  type Seat,
  type Settlement,
} from "../games";
import { clampInt } from "../games/helpers";
import type { Engines } from "../games/types";

export type { ActiveGame } from "../games";

// No I, O, 0, 1 to avoid confusion when sharing codes out loud
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

interface Tournament {
  games: GameKind[];
  legIndex: number;
  roundLimited: boolean;
  roundsPerLeg: number;
  escalate: boolean;
  startingChips: number;
  /** Points keyed by player id (seat). */
  points: Map<string, number>;
  phase: "playing" | "intermission" | "done";
  /** Player ids that won the leg just finished (intermission & done). */
  lastWinnerIds: string[];
  // Current-leg escalation state
  baseStake: number; // leg's base minBet (or big blind for poker)
  stakeMultiplier: number;
  /** Player ids knocked out of the current leg. */
  eliminatedIds: Set<string>;
}

/** Who owns a seat and where they are connected. Server-only: tokens never reach clients. */
interface SeatLink {
  token: string | null;
  socketId: string | null;
}

interface Room {
  tableTheme: TableTheme;
  turnTimer: TurnTimerSeconds;
  code: string;
  /**
   * Keyed by player id: the socket id at first join, kept for good so that a
   * reconnecting device (new socket id) finds its seat and game state again.
   * Insertion order = join order.
   */
  players: Map<string, Player>;
  links: Map<string, SeatLink>;
  game: ActiveGame | null;
  tournament: Tournament | null;
}

type JoinResult =
  | {
      ok: true;
      room: RoomState;
      playerId: string;
      /** A still-live socket that just lost this seat to the new connection. */
      replacedSocketId?: string;
    }
  | { ok: false; error: RoomError };

type StartGameResult =
  | { ok: true; code: string; room: RoomState }
  | { ok: false; error: GameAckError };

/**
 * Game state to broadcast: a single shared view, or one view per player when
 * the game has private information (poker hole cards).
 */
export type GameBroadcast =
  | { shared: GameStateView }
  | { perPlayer: Array<{ playerId: string; view: GameStateView }> };

export class RoomManager {
  private rooms = new Map<string, Room>();
  private seatBySocket = new Map<string, { code: string; playerId: string }>();

  createRoom(socketId: string, nickname: string, token: string | null = null): RoomState {
    const code = this.generateCode();
    const room: Room = {
      code,
      players: new Map(),
      links: new Map(),
      game: null,
      tournament: null,
      tableTheme: "wine",
      turnTimer: DEFAULT_TURN_TIMER,
    };
    room.players.set(socketId, { id: socketId, nickname, isHost: true, connected: true });
    room.links.set(socketId, { token, socketId });
    this.rooms.set(code, room);
    this.seatBySocket.set(socketId, { code, playerId: socketId });
    return toState(room);
  }

  /**
   * Idempotent: joining a room you are already in returns its current state.
   * A device token that already owns a seat takes that seat back (same chips,
   * same cards) instead of sitting down again, even if the room is full.
   */
  joinRoom(
    socketId: string,
    code: string,
    nickname: string,
    token: string | null = null,
  ): JoinResult {
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: "ROOM_NOT_FOUND" };
    const current = this.seatBySocket.get(socketId);
    if (current?.code === code) {
      return { ok: true, room: toState(room), playerId: current.playerId };
    }

    const owned = token ? [...room.links].find(([, link]) => link.token === token) : undefined;
    if (owned) {
      const [playerId, link] = owned;
      // The old socket may still look alive (a dropped network takes a while to
      // time out): the newest connection wins, the old one no longer has a seat.
      const replacedSocketId = link.socketId ?? undefined;
      if (replacedSocketId) this.seatBySocket.delete(replacedSocketId);
      link.socketId = socketId;
      this.seatBySocket.set(socketId, { code, playerId });
      room.players.get(playerId)!.connected = true;
      return { ok: true, room: toState(room), playerId, replacedSocketId };
    }

    if (room.players.size >= MAX_PLAYERS) return { ok: false, error: "ROOM_FULL" };

    room.players.set(socketId, { id: socketId, nickname, isHost: false, connected: true });
    room.links.set(socketId, { token, socketId });
    this.seatBySocket.set(socketId, { code, playerId: socketId });
    room.game?.game.addPlayer(socketId, nickname);
    return { ok: true, room: toState(room), playerId: socketId };
  }

  /**
   * Removes the socket's seat from its room, if any. Promotes a new host when
   * the host leaves, deletes the room when it empties.
   * Returns the updated room state to broadcast, or null if nothing to do.
   */
  leaveRoom(socketId: string): { code: string; room: RoomState | null } | null {
    const seat = this.seatBySocket.get(socketId);
    if (!seat) return null;
    this.seatBySocket.delete(socketId);

    const room = this.rooms.get(seat.code);
    if (!room) return null;
    return this.removeSeat(room, seat.playerId);
  }

  /**
   * The socket's connection dropped: its seat stays in play, held for its owner.
   * Null when the socket has no seat, e.g. it was already replaced by a newer one.
   */
  markDisconnected(socketId: string): { code: string; playerId: string; room: RoomState } | null {
    const seat = this.seatBySocket.get(socketId);
    if (!seat) return null;
    this.seatBySocket.delete(socketId);

    const room = this.rooms.get(seat.code);
    const player = room?.players.get(seat.playerId);
    const link = room?.links.get(seat.playerId);
    if (!room || !player || !link) return null;
    link.socketId = null;
    player.connected = false;
    return { code: seat.code, playerId: seat.playerId, room: toState(room) };
  }

  /** The grace period ran out: frees a seat whose owner hasn't come back. */
  expireSeat(code: string, playerId: string): { code: string; room: RoomState | null } | null {
    const room = this.rooms.get(code);
    const player = room?.players.get(playerId);
    if (!room || !player || player.connected) return null;
    return this.removeSeat(room, playerId);
  }

  private removeSeat(room: Room, playerId: string): { code: string; room: RoomState | null } {
    const leaving = room.players.get(playerId);
    room.players.delete(playerId);
    room.links.delete(playerId);
    room.game?.game.removePlayer(playerId);

    if (room.players.size === 0) {
      this.rooms.delete(room.code);
      return { code: room.code, room: null };
    }
    if (leaving?.isHost) {
      const players = [...room.players.values()];
      const next = players.find((p) => p.connected) ?? players[0];
      if (next) next.isHost = true;
    }
    return { code: room.code, room: toState(room) };
  }

  setTableTheme(socketId: string, theme: unknown): StartGameResult {
    const room = this.roomOf(socketId);
    if (!room) return { ok: false, error: "NO_ROOM" };
    if (!this.isHost(room, socketId)) return { ok: false, error: "NOT_HOST" };
    if (!TABLE_THEMES.some((allowed) => allowed === theme)) return { ok: false, error: "INVALID_THEME" };
    room.tableTheme = theme as TableTheme;
    return { ok: true, code: room.code, room: toState(room) };
  }

  setTurnTimer(socketId: string, seconds: unknown): StartGameResult {
    const room = this.roomOf(socketId);
    if (!room) return { ok: false, error: "NO_ROOM" };
    if (!this.isHost(room, socketId)) return { ok: false, error: "NOT_HOST" };
    if (!TURN_TIMER_OPTIONS.some((allowed) => allowed === seconds)) {
      return { ok: false, error: "INVALID_TURN_TIMER" };
    }
    room.turnTimer = seconds as TurnTimerSeconds;
    return { ok: true, code: room.code, room: toState(room) };
  }

  /** The decision to put on the clock, with its allowed time. Null when nothing is timed. */
  turnDecision(code: string): (PendingDecision & { durationMs: number }) | null {
    const room = this.rooms.get(code);
    if (!room?.game || room.turnTimer === 0) return null;
    const decision = runningGame(room.game).pendingDecision();
    return decision && { ...decision, durationMs: room.turnTimer * 1000 };
  }

  /** Time's up: everyone the table is waiting for gets their default action. */
  playTurnDefaults(code: string): void {
    const game = this.rooms.get(code)?.game;
    if (!game) return;
    const running = runningGame(game);
    for (const playerId of running.pendingDecision()?.playerIds ?? []) running.playDefault(playerId);
  }

  startGame(socketId: string, payload: GameStartPayload): StartGameResult {
    const room = this.roomOf(socketId);
    if (!room) return { ok: false, error: "NO_ROOM" };
    if (!this.isHost(room, socketId)) return { ok: false, error: "NOT_HOST" };
    if (room.game || room.tournament) return { ok: false, error: "GAME_IN_PROGRESS" };

    const input: Record<string, unknown> =
      typeof payload?.settings === "object" && payload.settings !== null ? payload.settings : {};
    const startingChips = clampInt(input.startingChips, 100, 1_000_000, 1000);
    const seats = this.seatsOf(room);
    const kind = payload?.game;
    if (!isGameKind(kind)) return { ok: false, error: "NO_GAME" };
    if (seats.length < GAMES[kind].minPlayers) return { ok: false, error: "NOT_ENOUGH_PLAYERS" };

    room.game = createGame(kind, seats, startingChips, input);
    return { ok: true, code: room.code, room: toState(room) };
  }

  /** Host only: start a chained-mini-games tournament (leg 0 begins immediately). */
  startTournament(socketId: string, settings: TournamentSettings): StartGameResult {
    const room = this.roomOf(socketId);
    if (!room) return { ok: false, error: "NO_ROOM" };
    if (!this.isHost(room, socketId)) return { ok: false, error: "NOT_HOST" };
    if (room.game || room.tournament) return { ok: false, error: "GAME_IN_PROGRESS" };

    // Keep only games that can be legs, in their fixed order; require enough of them
    const requested = Array.isArray(settings?.games) ? settings.games : [];
    const games = TOURNAMENT_ORDER.filter((k) => requested.includes(k));
    if (games.length < MIN_TOURNAMENT_GAMES) return { ok: false, error: "NOT_ENOUGH_GAMES" };

    const startingChips = clampInt(settings?.startingChips, 100, 1_000_000, 1000);
    room.tournament = {
      games,
      legIndex: 0,
      roundLimited: settings?.roundLimited !== false,
      roundsPerLeg: clampInt(settings?.roundsPerLeg, 1, 20, 3),
      escalate: settings?.escalate === true,
      startingChips,
      points: new Map(),
      phase: "playing",
      lastWinnerIds: [],
      baseStake: 0,
      stakeMultiplier: 1,
      eliminatedIds: new Set(),
    };
    const first = createGame(games[0]!, this.seatsOf(room), startingChips, {});
    room.game = first;
    room.tournament.baseStake = legBaseStake(first);
    return { ok: true, code: room.code, room: toState(room) };
  }

  /**
   * Applies escalation and decides whether the leg is over. Call after each
   * settled round. `settledRound` is that round's number (for the round-limited
   * format). Returns null when no tournament/game is active.
   */
  tournamentAfterRound(code: string, settledRound: number): { endLeg: boolean } | null {
    const room = this.rooms.get(code);
    const t = room?.tournament;
    if (!room || !t || !room.game) return null;

    const chips = gamePlayerChips(room.game);
    const markOut = () => {
      const floor = playableFloor(room.game!);
      for (const p of chips) if (p.chips < floor) t.eliminatedIds.add(p.id);
    };

    markOut();
    if (t.escalate) {
      const mult = t.eliminatedIds.size + 1;
      if (mult !== t.stakeMultiplier) {
        t.stakeMultiplier = mult;
        applyStake(room.game, t.baseStake, mult);
        markOut(); // the higher floor may knock out more players
      }
    }

    let endLeg: boolean;
    if (t.roundLimited) {
      endLeg = settledRound >= t.roundsPerLeg;
    } else {
      const floor = playableFloor(room.game);
      const active = chips.filter((p) => p.chips >= floor).length;
      endLeg = active === 0 || (chips.length >= 2 && active <= 1);
    }
    return { endLeg };
  }

  /**
   * Ends the current tournament leg: the chip leader(s) score a point, then we
   * move to intermission (more legs left) or done (last leg). The leg's game is
   * cleared. Returns the new phase so the caller can schedule the next leg.
   */
  endTournamentLeg(code: string): { phase: "intermission" | "done" } | null {
    const room = this.rooms.get(code);
    if (!room?.tournament || !room.game) return null;
    const t = room.tournament;

    const chips = gamePlayerChips(room.game);
    const max = chips.reduce((m, p) => Math.max(m, p.chips), -Infinity);
    const winners = chips.filter((p) => p.chips === max).map((p) => p.id);
    for (const id of winners) t.points.set(id, (t.points.get(id) ?? 0) + 1);
    t.lastWinnerIds = winners;

    room.game = null;
    t.legIndex += 1;
    t.phase = t.legIndex < t.games.length ? "intermission" : "done";
    return { phase: t.phase };
  }

  /** Starts the next leg's game (called after the intermission delay). */
  startTournamentLeg(code: string): boolean {
    const room = this.rooms.get(code);
    if (!room?.tournament || room.tournament.phase !== "intermission") return false;
    const t = room.tournament;
    const kind = t.games[t.legIndex];
    if (!kind) return false;
    const game = createGame(kind, this.seatsOf(room), t.startingChips, {});
    room.game = game;
    // Fresh leg: everyone back in, stakes back to base
    t.eliminatedIds = new Set();
    t.stakeMultiplier = 1;
    t.baseStake = legBaseStake(game);
    t.phase = "playing";
    return true;
  }

  tournamentActive(code: string): boolean {
    return this.rooms.get(code)?.tournament != null;
  }

  tournamentView(code: string): TournamentView | null {
    const room = this.rooms.get(code);
    const t = room?.tournament;
    if (!room || !t) return null;
    const standings = [...room.players.values()]
      .map((p) => ({ playerId: p.id, nickname: p.nickname, points: t.points.get(p.id) ?? 0 }))
      .sort((a, b) => b.points - a.points);
    const names = (ids: Iterable<string>) =>
      [...ids]
        .map((id) => room.players.get(id)?.nickname)
        .filter((n): n is string => typeof n === "string");
    return {
      games: t.games,
      legIndex: t.legIndex,
      roundsPerLeg: t.roundsPerLeg,
      currentGame: room.game?.kind ?? null,
      phase: t.phase,
      roundLimited: t.roundLimited,
      escalate: t.escalate,
      stakeMultiplier: t.stakeMultiplier,
      eliminated: names(t.eliminatedIds),
      standings,
      lastWinners: names(t.lastWinnerIds),
    };
  }

  /** Host only. Returns the lobby state to broadcast, or null if not allowed. */
  endGame(socketId: string): { code: string; room: RoomState } | null {
    const room = this.roomOf(socketId);
    if (!room || !this.isHost(room, socketId) || (!room.game && !room.tournament)) return null;
    room.game = null;
    room.tournament = null;
    return { code: room.code, room: toState(room) };
  }

  private seatsOf(room: Room): Seat[] {
    return [...room.players.values()].map((p) => ({ id: p.id, nickname: p.nickname }));
  }

  /** The socket's game engine, if its table is playing `kind` (tests reach engines this way). */
  withGame<K extends GameKind>(
    socketId: string,
    kind: K,
  ): { code: string; game: Engines[K]; playerId: string } | null {
    const room = this.roomOf(socketId);
    if (room?.game?.kind !== kind) return null;
    // The kind check above guarantees the engine; TS can't narrow a union by a generic kind
    const game = room.game.game as unknown as Engines[K];
    return { code: room.code, game, playerId: this.playerIdOf(socketId)! };
  }

  /**
   * Plays a game action for the socket's seat. Null code when the socket has no
   * table; the result says whether the state changed (and must be broadcast).
   */
  act(socketId: string, event: string, args: unknown[]): { code: string | null; result: GameAck } {
    const room = this.roomOf(socketId);
    // Rebuy is disabled during tournaments (going broke = elimination)
    if (room?.tournament && isBlockedInTournament(event)) {
      return { code: room.code, result: { ok: false, error: "CANNOT_REBUY" } };
    }
    const playerId = this.playerIdOf(socketId);
    const result = room?.game && playerId ? runningGame(room.game).act(event, playerId, args) : null;
    return { code: room?.code ?? null, result: result ?? { ok: false, error: "NO_GAME" } };
  }

  /** Games that chain rounds on their own: how long the result shows before the next one. */
  autoNextRoundDelay(code: string): number | null {
    const game = this.rooms.get(code)?.game;
    return game ? (runningGame(game).autoNextRound?.delayMs() ?? null) : null;
  }

  /** Starts the next round of a self-chaining game, if its result is still on screen. */
  advanceRound(code: string): boolean {
    const game = this.rooms.get(code)?.game;
    const auto = game && runningGame(game).autoNextRound;
    if (!auto || auto.delayMs() === null) return false;
    auto.advance();
    return true;
  }

  gameBroadcast(code: string): GameBroadcast | null {
    const room = this.rooms.get(code);
    if (!room?.game) return null;
    const running = runningGame(room.game);
    if (!running.isPrivate()) return { shared: running.view("") };
    return {
      perPlayer: [...room.players.keys()].map((playerId) => ({
        playerId,
        view: running.view(playerId),
      })),
    };
  }

  /**
   * If the active game has just settled a round, returns its round identifier
   * and each participating player's net chip change — so the caller can fold
   * those into persistent stats (recording each round at most once).
   */
  settlement(code: string): Settlement | null {
    const game = this.rooms.get(code)?.game;
    return game ? runningGame(game).settlement() : null;
  }

  roomCodeOf(socketId: string): string | undefined {
    return this.seatBySocket.get(socketId)?.code;
  }

  playerIdOf(socketId: string): string | undefined {
    return this.seatBySocket.get(socketId)?.playerId;
  }

  /** The seat owner's device token, to credit their persistent stats. */
  tokenOf(code: string, playerId: string): string | undefined {
    return this.rooms.get(code)?.links.get(playerId)?.token ?? undefined;
  }

  roomStateByCode(code: string): RoomState | null {
    const room = this.rooms.get(code);
    return room ? toState(room) : null;
  }

  private roomOf(socketId: string): Room | undefined {
    const code = this.seatBySocket.get(socketId)?.code;
    return code ? this.rooms.get(code) : undefined;
  }

  private isHost(room: Room, socketId: string): boolean {
    const playerId = this.playerIdOf(socketId);
    return playerId !== undefined && room.players.get(playerId)?.isHost === true;
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
    tableTheme: room.tableTheme,
    turnTimer: room.turnTimer,
    code: room.code,
    players: [...room.players.values()],
    maxPlayers: MAX_PLAYERS,
    activeGame: room.game?.kind ?? null,
    tournamentActive: room.tournament != null,
  };
}

// Tournament legs only run games that declare `tournament` hooks (see TOURNAMENT_ORDER).

/** Current chip stack per seat (chips are public in every game). */
function gamePlayerChips(game: ActiveGame): Array<{ id: string; chips: number }> {
  return runningGame(game).chips();
}

/** The leg's base stake to escalate from (min bet, or big blind for poker). */
function legBaseStake(game: ActiveGame): number {
  return runningGame(game).tournament?.baseStake() ?? 0;
}

/** Chips needed to still take part in the leg. */
function playableFloor(game: ActiveGame): number {
  return runningGame(game).tournament?.floor() ?? 1;
}

/** Apply an escalated stake (base × multiplier) to the running game. */
function applyStake(game: ActiveGame, base: number, multiplier: number): void {
  runningGame(game).tournament?.applyStake(base, multiplier);
}
