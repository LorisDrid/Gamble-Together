import type { Rng } from "../../random";
import { betPayout, betWins, spinWheel } from "./wheel";
import {
  ROULETTE_MAX_NUMBER,
  type RouletteBet,
  type RoulettePhase,
  type RouletteSettings,
  type RouletteView,
} from "./types";

export type RouletteError =
  | "WRONG_PHASE"
  | "UNKNOWN_PLAYER"
  | "INVALID_BET"
  | "ALREADY_READY"
  | "CANNOT_REBUY";

export type RouletteActionResult = { ok: true } | { ok: false; error: RouletteError };

const OK: RouletteActionResult = { ok: true };
const fail = (error: RouletteError): RouletteActionResult => ({ ok: false, error });

interface RouletteSeat {
  id: string;
  nickname: string;
  chips: number;
  bets: RouletteBet[];
  ready: boolean;
  lastNet: number | null;
}

/**
 * Authoritative roulette table. Pure state machine, rng injected.
 *
 * Round flow: betting (players stack bets, then each one validates — possibly
 * with no bets, i.e. passing) -> the wheel spins automatically when everyone
 * is ready -> result (chips settled) -> nextRound() -> betting.
 */
export class RouletteGame {
  private seats: RouletteSeat[] = [];
  private phase: RoulettePhase = "betting";
  private winningNumber: number | null = null;
  private round = 1;

  constructor(
    players: ReadonlyArray<{ id: string; nickname: string }>,
    private settings: RouletteSettings,
    private readonly rng: Rng = Math.random,
  ) {
    for (const player of players) {
      this.addPlayer(player.id, player.nickname);
    }
  }

  /** Raise (or change) the table minimum — used by tournament escalation. */
  setMinBet(minBet: number): void {
    if (Number.isInteger(minBet) && minBet > 0) {
      this.settings = { ...this.settings, minBet };
      this.maybeSpin(); // a higher floor can leave only broke players → spin
    }
  }

  addPlayer(id: string, nickname: string): void {
    if (this.seats.some((seat) => seat.id === id)) return;
    this.seats.push({
      id,
      nickname,
      chips: this.settings.startingChips,
      bets: [],
      ready: false,
      lastNet: null,
    });
  }

  removePlayer(id: string): void {
    const index = this.seats.findIndex((seat) => seat.id === id);
    if (index === -1) return;
    this.seats.splice(index, 1);
    // The departed player may have been the last one not ready
    if (this.phase === "betting") this.maybeSpin();
  }

  placeBet(id: string, bet: RouletteBet): RouletteActionResult {
    if (this.phase !== "betting") return fail("WRONG_PHASE");
    const seat = this.seats.find((s) => s.id === id);
    if (!seat) return fail("UNKNOWN_PLAYER");
    if (seat.ready) return fail("ALREADY_READY");

    const normalized = normalizeBet(bet, this.settings.minBet, seat.chips);
    if (!normalized) return fail("INVALID_BET");
    seat.chips -= normalized.amount;
    seat.bets.push(normalized);
    return OK;
  }

  /** Refunds every pending bet of the player. */
  clearBets(id: string): RouletteActionResult {
    if (this.phase !== "betting") return fail("WRONG_PHASE");
    const seat = this.seats.find((s) => s.id === id);
    if (!seat) return fail("UNKNOWN_PLAYER");
    if (seat.ready) return fail("ALREADY_READY");
    seat.chips += seat.bets.reduce((sum, bet) => sum + bet.amount, 0);
    seat.bets = [];
    return OK;
  }

  /** Locks the player's bets. Validating with no bets means passing the round. */
  setReady(id: string): RouletteActionResult {
    if (this.phase !== "betting") return fail("WRONG_PHASE");
    const seat = this.seats.find((s) => s.id === id);
    if (!seat) return fail("UNKNOWN_PLAYER");
    if (seat.ready) return fail("ALREADY_READY");
    seat.ready = true;
    this.maybeSpin();
    return OK;
  }

  /** Fictional chips: broke players can refill to the starting stack. */
  rebuy(id: string): RouletteActionResult {
    if (this.phase !== "betting") return fail("WRONG_PHASE");
    const seat = this.seats.find((s) => s.id === id);
    if (!seat) return fail("UNKNOWN_PLAYER");
    if (seat.ready || seat.bets.length > 0 || seat.chips >= this.settings.minBet) {
      return fail("CANNOT_REBUY");
    }
    seat.chips = this.settings.startingChips;
    return OK;
  }

  nextRound(): RouletteActionResult {
    if (this.phase !== "result") return fail("WRONG_PHASE");
    this.round++;
    this.winningNumber = null;
    for (const seat of this.seats) {
      seat.bets = [];
      seat.ready = false;
    }
    this.phase = "betting";
    return OK;
  }

  getView(): RouletteView {
    return {
      phase: this.phase,
      round: this.round,
      players: this.seats.map((seat) => ({
        id: seat.id,
        nickname: seat.nickname,
        chips: seat.chips,
        bets: seat.bets.map((bet) => ({ ...bet })),
        ready: seat.ready,
        lastNet: seat.lastNet,
      })),
      winningNumber: this.winningNumber,
      settings: { ...this.settings },
    };
  }

  private maybeSpin(): void {
    if (this.phase !== "betting") return;
    // A seat takes part if it can still afford the minimum OR has already staked
    // bets (even all-in, leaving it with 0 chips). Broke seats that placed no
    // bets (passed, or can't afford the minimum) don't hold up the wheel — but
    // we must still spin when everyone has shoved their whole stack in.
    const participants = this.seats.filter(
      (seat) => seat.chips >= this.settings.minBet || seat.bets.length > 0,
    );
    if (participants.length === 0) return;
    if (participants.every((seat) => seat.ready)) this.spin();
  }

  private spin(): void {
    const winning = spinWheel(this.rng);
    for (const seat of this.seats) {
      const staked = seat.bets.reduce((sum, bet) => sum + bet.amount, 0);
      const returned = seat.bets.reduce(
        (sum, bet) => sum + (betWins(bet, winning) ? betPayout(bet) : 0),
        0,
      );
      seat.chips += returned;
      seat.lastNet = returned - staked;
    }
    this.winningNumber = winning;
    this.phase = "result";
  }
}

/** Rebuilds the bet from scratch so no extra client-sent properties survive. */
function normalizeBet(bet: RouletteBet, minBet: number, chips: number): RouletteBet | null {
  if (typeof bet !== "object" || bet === null) return null;
  const amount = bet.amount;
  if (!Number.isInteger(amount) || amount < minBet || amount > chips) return null;
  switch (bet.kind) {
    case "straight": {
      const number = bet.number;
      if (!Number.isInteger(number) || number < 0 || number > ROULETTE_MAX_NUMBER) return null;
      return { kind: "straight", number, amount };
    }
    case "dozen": {
      if (bet.group !== 1 && bet.group !== 2 && bet.group !== 3) return null;
      return { kind: "dozen", group: bet.group, amount };
    }
    case "column": {
      if (bet.column !== 1 && bet.column !== 2 && bet.column !== 3) return null;
      return { kind: "column", column: bet.column, amount };
    }
    case "red":
    case "black":
    case "even":
    case "odd":
    case "low":
    case "high":
      return { kind: bet.kind, amount };
    default:
      return null;
  }
}
