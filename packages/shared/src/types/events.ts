import type { RoomState } from "./room";
import type { BlackjackError } from "../games/blackjack/game";
import type { BlackjackPower, BlackjackSettings, BlackjackView } from "../games/blackjack/types";
import type { RouletteError } from "../games/roulette/game";
import type { RouletteBet, RouletteSettings, RouletteView } from "../games/roulette/types";
import type { PokerError } from "../games/poker/game";
import type { PokerSettings, PokerView } from "../games/poker/types";
import type { LeaderboardEntry, LeaderboardMetric, PlayerProfile } from "./profile";
import type { TournamentSettings, TournamentView } from "./tournament";

export interface ProfileSyncPayload {
  token: string;
  nickname?: string;
}

export type RoomError = "ROOM_NOT_FOUND" | "ROOM_FULL" | "INVALID_NICKNAME";

export interface CreateRoomPayload {
  nickname: string;
}

export interface JoinRoomPayload {
  code: string;
  nickname: string;
}

export type RoomAck =
  | { ok: true; room: RoomState; playerId: string }
  | { ok: false; error: RoomError };

export type GameAckError =
  | BlackjackError
  | RouletteError
  | PokerError
  | "NO_ROOM"
  | "NO_GAME"
  | "NOT_HOST"
  | "GAME_IN_PROGRESS"
  | "NOT_ENOUGH_GAMES";

export type GameAck = { ok: true } | { ok: false; error: GameAckError };

export type GameStartPayload =
  | { game: "blackjack"; settings: Partial<BlackjackSettings> }
  | { game: "roulette"; settings: Partial<RouletteSettings> }
  | { game: "poker"; settings: Partial<PokerSettings> };

/** Tagged game state so clients render the right table. Poker views are personalized per player. */
export type GameStateView =
  | { game: "blackjack"; view: BlackjackView }
  | { game: "roulette"; view: RouletteView }
  | { game: "poker"; view: PokerView };

/** Events the client emits to the server. */
export interface ClientToServerEvents {
  /** Identify the persistent guest; returns the stored profile (or null if new). */
  "profile:sync": (payload: ProfileSyncPayload, ack: (profile: PlayerProfile | null) => void) => void;
  /** Top players ranked by the given metric (own row flagged `isMe`). */
  "leaderboard:get": (metric: LeaderboardMetric, ack: (rows: LeaderboardEntry[]) => void) => void;
  "room:create": (payload: CreateRoomPayload, ack: (res: RoomAck) => void) => void;
  "room:join": (payload: JoinRoomPayload, ack: (res: RoomAck) => void) => void;
  "room:leave": () => void;
  /** Host only: starts a game with the table settings. */
  "game:start": (payload: GameStartPayload, ack: (res: GameAck) => void) => void;
  /** Host only: starts a tournament (chained mini-games, point per leg). */
  "tournament:start": (settings: TournamentSettings, ack: (res: GameAck) => void) => void;
  /** Host only: ends the game/tournament and returns the table to the lobby. */
  "game:end": () => void;
  "blackjack:bet": (amount: number, ack: (res: GameAck) => void) => void;
  "blackjack:hit": (ack: (res: GameAck) => void) => void;
  "blackjack:stand": (ack: (res: GameAck) => void) => void;
  "blackjack:rebuy": (ack: (res: GameAck) => void) => void;
  "blackjack:nextRound": (ack: (res: GameAck) => void) => void;
  /** Sabotage mode: spend a procced Valet power (instant, real-time). */
  "blackjack:power": (power: BlackjackPower, ack: (res: GameAck) => void) => void;
  /** Sabotage mode: decline a procced power so the round can settle. */
  "blackjack:skipPower": (ack: (res: GameAck) => void) => void;
  "roulette:bet": (bet: RouletteBet, ack: (res: GameAck) => void) => void;
  "roulette:clearBets": (ack: (res: GameAck) => void) => void;
  "roulette:ready": (ack: (res: GameAck) => void) => void;
  "roulette:rebuy": (ack: (res: GameAck) => void) => void;
  "roulette:nextRound": (ack: (res: GameAck) => void) => void;
  "poker:fold": (ack: (res: GameAck) => void) => void;
  "poker:check": (ack: (res: GameAck) => void) => void;
  "poker:call": (ack: (res: GameAck) => void) => void;
  /** No-limit raise, expressed as the total bet target for the street. */
  "poker:raise": (amount: number, ack: (res: GameAck) => void) => void;
  "poker:nextHand": (ack: (res: GameAck) => void) => void;
  "poker:rebuy": (ack: (res: GameAck) => void) => void;
}

/** Events the server emits to clients. */
export interface ServerToClientEvents {
  "room:state": (state: RoomState) => void;
  "game:state": (state: GameStateView) => void;
  /** Tournament overlay (banner + standings); null when no tournament is running. */
  "tournament:state": (view: TournamentView | null) => void;
}
