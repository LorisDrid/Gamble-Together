import type { Rng } from "../../random";
import { createDeck, shuffle, type Card } from "../../deck";
import { resolveCoup } from "./rules";
import {
  BACCARAT_BANKER_COMMISSION,
  BACCARAT_TIE_PAYOUT,
  type BaccaratBet,
  type BaccaratBetKind,
  type BaccaratOutcome,
  type BaccaratPhase,
  type BaccaratSettings,
  type BaccaratView,
} from "./types";

export type BaccaratError =
  | "WRONG_PHASE"
  | "UNKNOWN_PLAYER"
  | "INVALID_BET"
  | "ALREADY_READY"
  | "CANNOT_REBUY";

export type BaccaratActionResult = { ok: true } | { ok: false; error: BaccaratError };

const OK: BaccaratActionResult = { ok: true };
const fail = (error: BaccaratError): BaccaratActionResult => ({ ok: false, error });

interface Seat {
  id: string;
  nickname: string;
  chips: number;
  bets: BaccaratBet[];
  ready: boolean;
  lastNet: number | null;
}

/**
 * Authoritative baccarat (Punto Banco) table. Pure state machine, rng injected.
 * No player decisions — everyone bets on the Player, the Banker, or a Tie, then
 * the coup is dealt and resolved by the fixed third-card rules (see rules.ts).
 *
 * Round flow: betting (stack bets, then validate — possibly with none, i.e. pass)
 * -> the coup is dealt once everyone is ready -> result (chips settled)
 * -> nextRound() -> betting.
 */
export class BaccaratGame {
  private seats: Seat[] = [];
  private phase: BaccaratPhase = "betting";
  private round = 1;
  private playerHand: Card[] = [];
  private bankerHand: Card[] = [];
  private outcome: BaccaratOutcome | null = null;

  constructor(
    players: ReadonlyArray<{ id: string; nickname: string }>,
    private settings: BaccaratSettings,
    private readonly rng: Rng = Math.random,
    /** Test seam: deal from this exact shoe instead of shuffling. */
    private readonly fixedShoe?: Card[],
  ) {
    for (const player of players) this.addPlayer(player.id, player.nickname);
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
    if (this.phase === "betting") this.maybeDeal();
  }

  placeBet(id: string, bet: BaccaratBet): BaccaratActionResult {
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
  clearBets(id: string): BaccaratActionResult {
    if (this.phase !== "betting") return fail("WRONG_PHASE");
    const seat = this.seats.find((s) => s.id === id);
    if (!seat) return fail("UNKNOWN_PLAYER");
    if (seat.ready) return fail("ALREADY_READY");
    seat.chips += seat.bets.reduce((sum, bet) => sum + bet.amount, 0);
    seat.bets = [];
    return OK;
  }

  /** Locks the player's bets. Validating with no bets means passing the coup. */
  setReady(id: string): BaccaratActionResult {
    if (this.phase !== "betting") return fail("WRONG_PHASE");
    const seat = this.seats.find((s) => s.id === id);
    if (!seat) return fail("UNKNOWN_PLAYER");
    if (seat.ready) return fail("ALREADY_READY");
    seat.ready = true;
    this.maybeDeal();
    return OK;
  }

  /** Fictional chips: broke players can refill to the starting stack. */
  rebuy(id: string): BaccaratActionResult {
    if (this.phase !== "betting") return fail("WRONG_PHASE");
    const seat = this.seats.find((s) => s.id === id);
    if (!seat) return fail("UNKNOWN_PLAYER");
    if (seat.ready || seat.bets.length > 0 || seat.chips >= this.settings.minBet) {
      return fail("CANNOT_REBUY");
    }
    seat.chips = this.settings.startingChips;
    return OK;
  }

  nextRound(): BaccaratActionResult {
    if (this.phase !== "result") return fail("WRONG_PHASE");
    this.round++;
    this.playerHand = [];
    this.bankerHand = [];
    this.outcome = null;
    for (const seat of this.seats) {
      seat.bets = [];
      seat.ready = false;
    }
    this.phase = "betting";
    return OK;
  }

  getView(): BaccaratView {
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
      playerHand: this.playerHand.map((c) => ({ ...c })),
      bankerHand: this.bankerHand.map((c) => ({ ...c })),
      outcome: this.outcome,
      settings: { ...this.settings },
    };
  }

  private maybeDeal(): void {
    if (this.phase !== "betting") return;
    // Players who can't afford the minimum can't hold up the table.
    const canPlay = this.seats.filter((seat) => seat.chips >= this.settings.minBet);
    if (canPlay.length === 0) return;
    if (canPlay.every((seat) => seat.ready)) this.deal();
  }

  private deal(): void {
    const shoe = this.fixedShoe ?? shuffle(createDeck(this.settings.deckCount), this.rng);
    const coup = resolveCoup(shoe);
    this.playerHand = coup.playerHand;
    this.bankerHand = coup.bankerHand;
    this.outcome = coup.outcome;
    for (const seat of this.seats) {
      const staked = seat.bets.reduce((sum, bet) => sum + bet.amount, 0);
      const returned = seat.bets.reduce((sum, bet) => sum + payout(bet, coup.outcome), 0);
      seat.chips += returned;
      seat.lastNet = returned - staked;
    }
    this.phase = "result";
  }
}

/** Total returned for a bet given the outcome (stake included; 0 = lost). */
function payout(bet: BaccaratBet, outcome: BaccaratOutcome): number {
  if (bet.kind === "tie") return outcome === "tie" ? bet.amount * (BACCARAT_TIE_PAYOUT + 1) : 0;
  // Player / Banker bets push (are returned) on a tie.
  if (outcome === "tie") return bet.amount;
  if (bet.kind !== outcome) return 0;
  if (bet.kind === "banker") {
    return bet.amount + Math.floor(bet.amount * (1 - BACCARAT_BANKER_COMMISSION));
  }
  return bet.amount * 2;
}

/** Rebuilds the bet so no extra client-sent properties survive. */
function normalizeBet(bet: BaccaratBet, minBet: number, chips: number): BaccaratBet | null {
  if (typeof bet !== "object" || bet === null) return null;
  const { kind, amount } = bet;
  if (kind !== "player" && kind !== "banker" && kind !== "tie") return null;
  if (!Number.isInteger(amount) || amount < minBet || amount > chips) return null;
  return { kind: kind as BaccaratBetKind, amount };
}
