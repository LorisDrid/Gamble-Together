import {
  BlackjackGame,
  DEFAULT_BLACKJACK_SETTINGS,
  DEFAULT_ROULETTE_SETTINGS,
  MAX_PLAYERS,
  ROOM_CODE_LENGTH,
  RouletteGame,
} from "@gamble/shared";
import type {
  GameAckError,
  GameStartPayload,
  GameStateView,
  Player,
  RoomError,
  RoomState,
} from "@gamble/shared";

// No I, O, 0, 1 to avoid confusion when sharing codes out loud
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type ActiveGame =
  | { kind: "blackjack"; game: BlackjackGame }
  | { kind: "roulette"; game: RouletteGame };

interface Room {
  code: string;
  /** Keyed by socket id. Insertion order = join order. */
  players: Map<string, Player>;
  game: ActiveGame | null;
}

type JoinResult =
  | { ok: true; room: RoomState }
  | { ok: false; error: RoomError };

type StartGameResult =
  | { ok: true; code: string; room: RoomState; view: GameStateView }
  | { ok: false; error: GameAckError };

export class RoomManager {
  private rooms = new Map<string, Room>();
  private roomCodeBySocket = new Map<string, string>();

  createRoom(socketId: string, nickname: string): RoomState {
    const code = this.generateCode();
    const room: Room = { code, players: new Map(), game: null };
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
    room.game?.game.addPlayer(socketId, nickname);
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
    room.game?.game.removePlayer(socketId);

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

  startGame(socketId: string, payload: GameStartPayload): StartGameResult {
    const room = this.roomOf(socketId);
    if (!room) return { ok: false, error: "NO_ROOM" };
    if (!room.players.get(socketId)?.isHost) return { ok: false, error: "NOT_HOST" };
    if (room.game) return { ok: false, error: "GAME_IN_PROGRESS" };

    const seats = [...room.players.values()].map((p) => ({ id: p.id, nickname: p.nickname }));
    const input = typeof payload?.settings === "object" && payload.settings !== null ? payload.settings : {};

    if (payload?.game === "blackjack") {
      const defaults = DEFAULT_BLACKJACK_SETTINGS;
      const startingChips = clampInt(input.startingChips, 100, 1_000_000, defaults.startingChips);
      room.game = {
        kind: "blackjack",
        game: new BlackjackGame(seats, {
          startingChips,
          minBet: clampInt(input.minBet, 1, startingChips, defaults.minBet),
          deckCount: defaults.deckCount,
        }),
      };
    } else if (payload?.game === "roulette") {
      const defaults = DEFAULT_ROULETTE_SETTINGS;
      const startingChips = clampInt(input.startingChips, 100, 1_000_000, defaults.startingChips);
      room.game = {
        kind: "roulette",
        game: new RouletteGame(seats, {
          startingChips,
          minBet: clampInt(input.minBet, 1, startingChips, defaults.minBet),
        }),
      };
    } else {
      return { ok: false, error: "NO_GAME" };
    }

    return { ok: true, code: room.code, room: toState(room), view: toGameView(room.game) };
  }

  /** Host only. Returns the lobby state to broadcast, or null if not allowed. */
  endGame(socketId: string): { code: string; room: RoomState } | null {
    const room = this.roomOf(socketId);
    if (!room || !room.players.get(socketId)?.isHost || !room.game) return null;
    room.game = null;
    return { code: room.code, room: toState(room) };
  }

  withBlackjack(socketId: string): { code: string; game: BlackjackGame } | null {
    const room = this.roomOf(socketId);
    if (room?.game?.kind !== "blackjack") return null;
    return { code: room.code, game: room.game.game };
  }

  withRoulette(socketId: string): { code: string; game: RouletteGame } | null {
    const room = this.roomOf(socketId);
    if (room?.game?.kind !== "roulette") return null;
    return { code: room.code, game: room.game.game };
  }

  gameView(code: string): GameStateView | null {
    const game = this.rooms.get(code)?.game;
    return game ? toGameView(game) : null;
  }

  roomCodeOf(socketId: string): string | undefined {
    return this.roomCodeBySocket.get(socketId);
  }

  private roomOf(socketId: string): Room | undefined {
    const code = this.roomCodeBySocket.get(socketId);
    return code ? this.rooms.get(code) : undefined;
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
    activeGame: room.game?.kind ?? null,
  };
}

function toGameView(active: ActiveGame): GameStateView {
  return active.kind === "blackjack"
    ? { game: "blackjack", view: active.game.getView() }
    : { game: "roulette", view: active.game.getView() };
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}
