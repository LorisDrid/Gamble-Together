import {
  BaccaratGame,
  BlackjackGame,
  payout as blackjackPayout,
  DEFAULT_BACCARAT_SETTINGS,
  DEFAULT_BLACKJACK_SETTINGS,
  DEFAULT_POKER_SETTINGS,
  DEFAULT_PRESIDENT_SETTINGS,
  DEFAULT_ROULETTE_SETTINGS,
  MAX_PLAYERS,
  PokerGame,
  PRESIDENT_MIN_PLAYERS,
  PresidentGame,
  ROOM_CODE_LENGTH,
  RouletteGame,
} from "@gamble/shared";
import type {
  GameAckError,
  GameKind,
  GameStartPayload,
  GameStateView,
  Player,
  RoomError,
  RoomState,
  TournamentSettings,
  TournamentView,
} from "@gamble/shared";
import { MIN_TOURNAMENT_GAMES } from "@gamble/shared";

// No I, O, 0, 1 to avoid confusion when sharing codes out loud
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type ActiveGame =
  | { kind: "blackjack"; game: BlackjackGame }
  | { kind: "roulette"; game: RouletteGame }
  | { kind: "poker"; game: PokerGame }
  | { kind: "president"; game: PresidentGame }
  | { kind: "baccarat"; game: BaccaratGame };

interface Seat {
  id: string;
  nickname: string;
}

interface Tournament {
  games: GameKind[];
  legIndex: number;
  roundLimited: boolean;
  roundsPerLeg: number;
  escalate: boolean;
  startingChips: number;
  /** Points keyed by socket id (seat). */
  points: Map<string, number>;
  phase: "playing" | "intermission" | "done";
  /** Socket ids that won the leg just finished (intermission & done). */
  lastWinnerIds: string[];
  // Current-leg escalation state
  baseStake: number; // leg's base minBet (or big blind for poker)
  stakeMultiplier: number;
  /** Socket ids knocked out of the current leg. */
  eliminatedIds: Set<string>;
}

interface Room {
  code: string;
  /** Keyed by socket id. Insertion order = join order. */
  players: Map<string, Player>;
  game: ActiveGame | null;
  tournament: Tournament | null;
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
    const room: Room = { code, players: new Map(), game: null, tournament: null };
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
    if (room.game || room.tournament) return { ok: false, error: "GAME_IN_PROGRESS" };

    const input: Record<string, unknown> =
      typeof payload?.settings === "object" && payload.settings !== null ? payload.settings : {};
    const startingChips = clampInt(input.startingChips, 100, 1_000_000, 1000);
    const seats = this.seatsOf(room);
    if (payload?.game === "president" && seats.length < PRESIDENT_MIN_PLAYERS) {
      return { ok: false, error: "NOT_ENOUGH_PLAYERS" };
    }
    const game = createGame(payload?.game, seats, startingChips, input);
    if (!game) return { ok: false, error: "NO_GAME" };

    room.game = game;
    return { ok: true, code: room.code, room: toState(room) };
  }

  /** Host only: start a chained-mini-games tournament (leg 0 begins immediately). */
  startTournament(socketId: string, settings: TournamentSettings): StartGameResult {
    const room = this.roomOf(socketId);
    if (!room) return { ok: false, error: "NO_ROOM" };
    if (!room.players.get(socketId)?.isHost) return { ok: false, error: "NOT_HOST" };
    if (room.game || room.tournament) return { ok: false, error: "GAME_IN_PROGRESS" };

    // Keep only valid kinds, in the fixed canonical order; require enough of them
    const order: GameKind[] = ["blackjack", "roulette", "poker"];
    const requested = Array.isArray(settings?.games) ? settings.games : [];
    const games = order.filter((k) => requested.includes(k));
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
    const first = createGame(games[0], this.seatsOf(room), startingChips, {});
    if (!first) {
      room.tournament = null;
      return { ok: false, error: "NO_GAME" };
    }
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
    const game = createGame(t.games[t.legIndex], this.seatsOf(room), t.startingChips, {});
    if (!game) return false;
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
    if (!room || !room.players.get(socketId)?.isHost || (!room.game && !room.tournament)) return null;
    room.game = null;
    room.tournament = null;
    return { code: room.code, room: toState(room) };
  }

  private seatsOf(room: Room): Seat[] {
    return [...room.players.values()].map((p) => ({ id: p.id, nickname: p.nickname }));
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

  withPresident(socketId: string): { code: string; game: PresidentGame } | null {
    const room = this.roomOf(socketId);
    if (room?.game?.kind !== "president") return null;
    return { code: room.code, game: room.game.game };
  }

  withBaccarat(socketId: string): { code: string; game: BaccaratGame } | null {
    const room = this.roomOf(socketId);
    if (room?.game?.kind !== "baccarat") return null;
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
    if (room.game.kind === "blackjack") {
      const game = room.game.game;
      // Sabotage mode hides held powers / shields per player, so views are
      // personalized; plain blackjack has no secrets and stays a shared view.
      if (game.getView().settings.sabotage) {
        return {
          perPlayer: [...room.players.keys()].map((playerId) => ({
            playerId,
            view: { game: "blackjack", view: game.getView(playerId) },
          })),
        };
      }
      return { shared: { game: "blackjack", view: game.getView() } };
    }
    if (room.game.kind === "president") {
      const game = room.game.game;
      // Hands are private → one personalized view per player (like poker).
      return {
        perPlayer: [...room.players.keys()].map((playerId) => ({
          playerId,
          view: { game: "president", view: game.getView(playerId) },
        })),
      };
    }
    if (room.game.kind === "baccarat") {
      return { shared: { game: "baccarat", view: room.game.game.getView() } };
    }
    return { shared: { game: "roulette", view: room.game.game.getView() } };
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

    if (game.kind === "president") {
      const view = game.game.getView();
      if (view.phase !== "done") return null;
      const nets = view.players
        .filter((p) => p.lastNet !== null)
        .map((p) => ({ playerId: p.id, net: p.lastNet! }));
      return { round: view.round, nets };
    }

    if (game.kind === "baccarat") {
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

  roomStateByCode(code: string): RoomState | null {
    const room = this.rooms.get(code);
    return room ? toState(room) : null;
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
    tournamentActive: room.tournament != null,
  };
}

/** Builds a game of the given kind from defaults + the host-provided overrides. */
function createGame(
  kind: GameKind | undefined,
  seats: Seat[],
  startingChips: number,
  input: Record<string, unknown>,
): ActiveGame | null {
  if (kind === "blackjack") {
    return {
      kind: "blackjack",
      game: new BlackjackGame(seats, {
        startingChips,
        minBet: clampInt(input.minBet, 1, startingChips, DEFAULT_BLACKJACK_SETTINGS.minBet),
        deckCount: DEFAULT_BLACKJACK_SETTINGS.deckCount,
        sabotage: input.sabotage === true,
      }),
    };
  }
  if (kind === "roulette") {
    return {
      kind: "roulette",
      game: new RouletteGame(seats, {
        startingChips,
        minBet: clampInt(input.minBet, 1, startingChips, DEFAULT_ROULETTE_SETTINGS.minBet),
      }),
    };
  }
  if (kind === "poker") {
    const smallBlind = clampInt(
      input.smallBlind,
      1,
      Math.floor(startingChips / 2),
      DEFAULT_POKER_SETTINGS.smallBlind,
    );
    return {
      kind: "poker",
      game: new PokerGame(seats, {
        startingChips,
        smallBlind,
        bigBlind: clampInt(input.bigBlind, smallBlind, startingChips, smallBlind * 2),
      }),
    };
  }
  if (kind === "president") {
    return {
      kind: "president",
      game: new PresidentGame(seats, {
        startingChips,
        ante: clampInt(input.ante, 1, startingChips, DEFAULT_PRESIDENT_SETTINGS.ante),
      }),
    };
  }
  if (kind === "baccarat") {
    return {
      kind: "baccarat",
      game: new BaccaratGame(seats, {
        startingChips,
        minBet: clampInt(input.minBet, 1, startingChips, DEFAULT_BACCARAT_SETTINGS.minBet),
        deckCount: DEFAULT_BACCARAT_SETTINGS.deckCount,
      }),
    };
  }
  return null;
}

/** Current chip stack per seat, whatever the game kind (chips are public). */
function gamePlayerChips(game: ActiveGame): Array<{ id: string; chips: number }> {
  const players =
    game.kind === "poker" ? game.game.getViewFor("").players : game.game.getView().players;
  return players.map((p) => ({ id: p.id, chips: p.chips }));
}

// The escalation helpers below only apply to tournament legs (blackjack /
// roulette / poker). Président is never a tournament game, so it falls through.

/** The leg's base stake to escalate from (min bet, or big blind for poker). */
function legBaseStake(game: ActiveGame): number {
  if (game.kind === "poker") return game.game.getViewFor("").settings.bigBlind;
  if (game.kind === "blackjack" || game.kind === "roulette") {
    return game.game.getView().settings.minBet;
  }
  return 0;
}

/** Chips needed to still take part: the current min bet, or just >0 in poker. */
function playableFloor(game: ActiveGame): number {
  if (game.kind === "blackjack" || game.kind === "roulette") {
    return game.game.getView().settings.minBet;
  }
  return 1; // poker / président
}

/** Apply an escalated stake (base × multiplier) to the running game. */
function applyStake(game: ActiveGame, base: number, multiplier: number): void {
  const stake = Math.max(1, base * multiplier);
  if (game.kind === "poker") {
    game.game.setBlinds(Math.max(1, Math.round(stake / 2)), stake);
  } else if (game.kind === "blackjack" || game.kind === "roulette") {
    game.game.setMinBet(stake);
  }
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}
