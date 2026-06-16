import type { Rng } from "../../random";
import { bidBeats, tally } from "./rules";
import type {
  LiarsDiceBid,
  LiarsDicePhase,
  LiarsDiceReveal,
  LiarsDiceSettings,
  LiarsDiceView,
} from "./types";

export type LiarsDiceError =
  | "WRONG_PHASE"
  | "NOT_YOUR_TURN"
  | "NO_BID"
  | "INVALID_BID";

export type LiarsDiceActionResult = { ok: true } | { ok: false; error: LiarsDiceError };

const OK: LiarsDiceActionResult = { ok: true };
const fail = (error: LiarsDiceError): LiarsDiceActionResult => ({ ok: false, error });

interface Seat {
  id: string;
  nickname: string;
  /** This round's roll (length = numDice for active seats; [] when eliminated). */
  dice: number[];
  /** Dice the player has going forward. */
  numDice: number;
  chips: number;
  antePaid: number;
  lastNet: number | null;
  eliminated: boolean;
}

/**
 * Authoritative Liar's Dice (Perudo) game. Pure state machine, rng injected.
 * Turn-based bidding on the total count of a face across ALL dice (1s wild);
 * a challenge ("Menteur !") reveals every die — the loser drops a die, and the
 * last player with dice wins the pot. Dice are private per player (see getView).
 */
export class LiarsDiceGame {
  private seats: Seat[] = [];
  private phase: LiarsDicePhase = "bidding";
  private round = 1;
  private currentIndex = 0;
  private currentBid: LiarsDiceBid | null = null;
  private bidderIndex: number | null = null;
  private pot = 0;
  private reveal: LiarsDiceReveal | null = null;
  private winnerId: string | null = null;
  private lastLoserIndex = 0;

  constructor(
    players: ReadonlyArray<{ id: string; nickname: string }>,
    private settings: LiarsDiceSettings,
    private readonly rng: Rng = Math.random,
  ) {
    this.seats = players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      dice: [],
      numDice: settings.diceCount,
      chips: settings.startingChips,
      antePaid: 0,
      lastNet: null,
      eliminated: false,
    }));
    // Ante into the pot.
    for (const seat of this.seats) {
      const ante = Math.min(this.settings.ante, seat.chips);
      seat.chips -= ante;
      seat.antePaid = ante;
      this.pot += ante;
    }
    this.rollAll();
  }

  /** Raise the standing bid. */
  bid(id: string, quantity: number, face: number): LiarsDiceActionResult {
    if (this.phase !== "bidding") return fail("WRONG_PHASE");
    const seat = this.seats[this.currentIndex]!;
    if (seat.id !== id) return fail("NOT_YOUR_TURN");
    const next: LiarsDiceBid = { quantity, face };
    if (!bidBeats(this.currentBid, next)) return fail("INVALID_BID");
    this.currentBid = next;
    this.bidderIndex = this.currentIndex;
    this.advance();
    return OK;
  }

  /** Call the standing bid a lie: reveal all dice and resolve who drops a die. */
  challenge(id: string): LiarsDiceActionResult {
    if (this.phase !== "bidding") return fail("WRONG_PHASE");
    const seat = this.seats[this.currentIndex]!;
    if (seat.id !== id) return fail("NOT_YOUR_TURN");
    if (this.currentBid === null || this.bidderIndex === null) return fail("NO_BID");

    const allDice = this.seats.flatMap((s) => s.dice);
    const actual = tally(allDice, this.currentBid.face);
    const held = actual >= this.currentBid.quantity;
    const loserIndex = held ? this.currentIndex : this.bidderIndex;
    const loser = this.seats[loserIndex]!;

    loser.numDice -= 1;
    if (loser.numDice <= 0) loser.eliminated = true;

    this.reveal = {
      bid: this.currentBid,
      actual,
      challengerId: seat.id,
      bidderId: this.seats[this.bidderIndex]!.id,
      loserId: loser.id,
    };
    this.lastLoserIndex = loserIndex;

    if (!this.endIfGameOver()) this.phase = "reveal";
    return OK;
  }

  /** Start the next round after a reveal (re-roll; the player who lost opens). */
  nextRound(): LiarsDiceActionResult {
    if (this.phase !== "reveal") return fail("WRONG_PHASE");
    this.round += 1;
    this.currentBid = null;
    this.bidderIndex = null;
    this.reveal = null;
    this.rollAll();
    this.currentIndex = this.seats[this.lastLoserIndex]!.eliminated
      ? this.nextActiveFrom(this.lastLoserIndex)
      : this.lastLoserIndex;
    this.phase = "bidding";
    return OK;
  }

  /** A latecomer can't join a game in progress — they sit out as a spectator. */
  addPlayer(id: string, nickname: string): void {
    if (this.seats.some((s) => s.id === id)) return;
    this.seats.push({
      id,
      nickname,
      dice: [],
      numDice: 0,
      chips: this.settings.startingChips,
      antePaid: 0,
      lastNet: null,
      eliminated: true,
    });
  }

  /** A player leaves: they forfeit, the turn moves on, the game may end. */
  removePlayer(id: string): void {
    const index = this.seats.findIndex((s) => s.id === id);
    if (index === -1 || this.seats[index]!.eliminated) return;
    const wasCurrent = this.currentIndex === index;
    const seat = this.seats[index]!;
    seat.eliminated = true;
    seat.numDice = 0;
    seat.dice = [];

    if (this.phase === "bidding") {
      if (this.endIfGameOver()) return;
      if (wasCurrent) this.currentIndex = this.nextActiveFrom(index);
    } else if (this.phase === "reveal") {
      this.endIfGameOver();
    }
  }

  getView(viewerId = ""): LiarsDiceView {
    const showAll = this.phase === "reveal" || this.phase === "done";
    return {
      phase: this.phase,
      round: this.round,
      currentPlayerId: this.phase === "bidding" ? (this.seats[this.currentIndex]?.id ?? null) : null,
      currentBid: this.currentBid ? { ...this.currentBid } : null,
      bidderId: this.bidderIndex !== null ? (this.seats[this.bidderIndex]?.id ?? null) : null,
      pot: this.pot,
      reveal: this.reveal ? { ...this.reveal, bid: { ...this.reveal.bid } } : null,
      winnerId: this.winnerId,
      players: this.seats.map((seat) => ({
        id: seat.id,
        nickname: seat.nickname,
        diceCount: seat.numDice,
        dice: seat.id === viewerId || showAll ? [...seat.dice] : null,
        chips: seat.chips,
        lastNet: seat.lastNet,
        eliminated: seat.eliminated,
      })),
    };
  }

  private rollAll(): void {
    for (const seat of this.seats) {
      seat.dice = seat.eliminated
        ? []
        : Array.from({ length: seat.numDice }, () => Math.floor(this.rng() * 6) + 1);
    }
  }

  /** When one (or zero) players remain, pay out the pot and finish. */
  private endIfGameOver(): boolean {
    const active = this.seats.filter((s) => !s.eliminated);
    if (active.length > 1) return false;
    const winner = active[0];
    if (winner) winner.chips += this.pot;
    for (const seat of this.seats) {
      if (seat.antePaid > 0) seat.lastNet = (seat === winner ? this.pot : 0) - seat.antePaid;
    }
    this.winnerId = winner?.id ?? null;
    this.pot = 0;
    this.phase = "done";
    return true;
  }

  private advance(): void {
    this.currentIndex = this.nextActiveFrom(this.currentIndex);
  }

  private nextActiveFrom(from: number): number {
    const n = this.seats.length;
    for (let step = 1; step <= n; step++) {
      const idx = (from + step) % n;
      if (!this.seats[idx]!.eliminated) return idx;
    }
    return from;
  }
}
