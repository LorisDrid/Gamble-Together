import {
  BlackjackGame,
  payout as blackjackPayout,
  DEFAULT_BLACKJACK_SETTINGS,
  DEFAULT_POKER_SETTINGS,
  DEFAULT_ROULETTE_SETTINGS,
  MAX_PLAYERS,
  PokerGame,
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
  | { kind: "roulette"; game: RouletteGame }
  | { kind: "poker"; game: PokerGame };

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
    const input: Record<string, unknown> =
      typeof payload?.settings === "object" && payload.settings !== null ? payload.settings : {};
    const startingChips = clampInt(input.startingChips, 100, 1_000_000, 1000);

    if (payload?.game === "blackjack") {
      room.game = {
        kind: "blackjack",
        game: new BlackjackGame(seats, {
          startingChips,
          minBet: clampInt(input.minBet, 1, startingChips, DEFAULT_BLACKJACK_SETTINGS.minBet),
          deckCount: DEFAULT_BLACKJACK_SETTINGS.deckCount,
        }),
      };
    } else if (payload?.game === "roulette") {
      room.game = {
        kind: "roulette",
        game: new RouletteGame(seats, {
          startingChips,
          minBet: clampInt(input.minBet, 1, startingChips, DEFAULT_ROULETTE_SETTINGS.minBet),
        }),
      };
    } else if (payload?.game === "poker") {
      const smallBlind = clampInt(
        input.smallBlind,
        1,
        Math.floor(startingChips / 2),
        DEFAULT_POKER_SETTINGS.smallBlind,
      );
      room.game = {
        kind: "poker",
        game: new PokerGame(seats, {
          startingChips,
          smallBlind,
          bigBlind: clampInt(input.bigBlind, smallBlind, startingChips, smallBlind * 2),
        }),
      };
    } else {
      return { ok: false, error: "NO_GAME" };
    }

    return { ok: true, code: room.code, room: toState(room) };
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

  /** Looked up by room code (e.g. from a deferred auto-advance timer). */
  blackjackByCode(code: string): BlackjackGame | null {
    const room = this.rooms.get(code);
    return room?.game?.kind === "blackjack" ? room.game.game : null;
  }

  withRoulette(socketId: string): { code: string; game: RouletteGame } | null {
    const room = this.roomOf(socketId);
    if (room?.game?.kind !== "roulette") return null;
    return { code: room.code, game: room.game.game };
  }

  withPoker(socketId: string): { code: string; game: PokerGame } | null {
    const room = this.roomOf(socketId);
    if (room?.game?.kind !== "poker") return null;
    return { code: room.code, game: room.game.game };
  }

  gameBroadcast(code: string): GameBroadcast | null {
    const room = this.rooms.get(code);
    if (!room?.game) return null;
    if (room.game.kind === "poker") {
      const game = room.game.game;
      return {
        perPlayer: [...room.players.keys()].map((playerId) => ({
          playerId,
          view: { game: "poker", view: game.getViewFor(playerId) },
        })),
      };
    }
    return {
      shared:
        room.game.kind === "blackjack"
          ? { game: "blackjack", view: room.game.game.getView() }
          : { game: "roulette", view: room.game.game.getView() },
    };
  }

  /**
   * If the active game has just settled a round, returns its round identifier
   * and each participating player's net chip change — so the caller can fold
   * those into persistent stats (recording each round at most once).
   */
  settlement(code: string): { round: number; nets: Array<{ playerId: string; net: number }> } | null {
    const game = this.rooms.get(code)?.game;
    if (!game) return null;

    if (game.kind === "blackjack") {
      const view = game.game.getView();
      if (view.phase !== "payout") return null;
      const nets = view.players
        .filter((p) => p.inRound && p.bet !== null && p.result !== null)
        .map((p) => ({ playerId: p.id, net: blackjackPayout(p.bet!, p.result!) - p.bet! }));
      return { round: view.round, nets };
    }

    if (game.kind === "roulette") {
      const view = game.game.getView();
      if (view.phase !== "result") return null;
      const nets = view.players
        .filter((p) => p.bets.length > 0 && p.lastNet !== null)
        .map((p) => ({ playerId: p.id, net: p.lastNet! }));
      return { round: view.round, nets };
    }

    // Poker: views are per-player but stats only need chips/committed, which are
    // public, so any player's view carries every seat's settlement figures.
    const anyId = [...(this.rooms.get(code)?.players.keys() ?? [])][0];
    if (!anyId) return null;
    const view = game.game.getViewFor(anyId);
    if (view.phase !== "showdown") return null;
    const nets = view.players
      .filter((p) => p.committed > 0 || p.result !== null)
      .map((p) => ({ playerId: p.id, net: (p.result?.winnings ?? 0) - p.committed }));
    return { round: view.handNumber, nets };
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

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}
