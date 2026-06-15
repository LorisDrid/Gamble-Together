import type { Rng } from "../../random";
import { createDeck } from "../../deck";
import {
  DEFAULT_PRESIDENT_SETTINGS,
  PRESIDENT_NORMAL_ORDER,
  type PresidentCard,
  type PresidentPhase,
  type PresidentReturn,
  type PresidentSettings,
  type PresidentView,
} from "./types";

export type PresidentError =
  | "WRONG_PHASE"
  | "NOT_YOUR_TURN"
  | "NOT_IN_HAND"
  | "INVALID_COMBO"
  | "CANNOT_BEAT"
  | "CANNOT_PASS_LEAD"
  | "NO_RETURN_OWED"
  | "WRONG_COUNT";

export type PresidentActionResult = { ok: true } | { ok: false; error: PresidentError };

const OK: PresidentActionResult = { ok: true };
const fail = (error: PresidentError): PresidentActionResult => ({ ok: false, error });

/** A card's rank "key": its rank for normal cards, "joker" for jokers. */
type CardKey = string;

interface Seat {
  id: string;
  nickname: string;
  hand: PresidentCard[];
  chips: number;
  antePaid: number;
  lastNet: number | null;
  finished: boolean;
  passed: boolean;
}

/**
 * Authoritative Président game (multiple rounds). Pure state machine, rng
 * injected. Turn-based: the current player leads or follows a combination of N
 * same-rank cards (a stronger combo of the same size, or pass). The 2 is a bomb
 * that clears the pile; a quad triggers a révolution (reversed order); jokers are
 * the top rank. First to empty their hand is Président, last is Trou du cul.
 *
 * Each round: every player antes into a pot, which is paid out by finishing rank.
 * From round 2, the Trou du cul gives its best cards to the Président (who returns
 * cards of choice) — and similarly the second-last/Vice — before play begins.
 */
export class PresidentGame {
  private seats: Seat[] = [];
  private phase: PresidentPhase = "playing";
  private round = 1;
  private pot = 0;
  private pile: { cards: PresidentCard[]; key: CardKey; count: number } | null = null;
  private reversed = false;
  private currentIndex = 0;
  /** Index of the last player to lay a combo (wins the trick if all others pass). */
  private lastPlayerIndex: number | null = null;
  private finishingOrder: string[] = [];
  /** Previous round's finishing order — drives the exchange and the next leader. */
  private prevFinishingOrder: string[] = [];
  private pendingReturns: PresidentReturn[] = [];

  constructor(
    players: ReadonlyArray<{ id: string; nickname: string }>,
    private settings: PresidentSettings = DEFAULT_PRESIDENT_SETTINGS,
    private readonly rng: Rng = Math.random,
    /** Test seam: deal this exact deck (round-robin) instead of shuffling. */
    private readonly fixedDeck?: PresidentCard[],
  ) {
    this.seats = players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      hand: [],
      chips: settings.startingChips,
      antePaid: 0,
      lastNet: null,
      finished: false,
      passed: false,
    }));
    this.startRound();
  }

  /** Start the next round once the current one is done (re-deal, ante, exchange). */
  nextRound(): PresidentActionResult {
    if (this.phase !== "done") return fail("WRONG_PHASE");
    this.round += 1;
    this.startRound();
    return OK;
  }

  private startRound(): void {
    for (const seat of this.seats) {
      seat.hand = [];
      seat.finished = false;
      seat.passed = false;
      seat.antePaid = 0;
    }
    this.pile = null;
    this.reversed = false;
    this.lastPlayerIndex = null;
    this.finishingOrder = [];
    this.pendingReturns = [];

    // Ante into the pot.
    this.pot = 0;
    for (const seat of this.seats) {
      const ante = Math.min(this.settings.ante, seat.chips);
      seat.chips -= ante;
      seat.antePaid = ante;
      this.pot += ante;
    }

    this.deal();

    if (this.prevFinishingOrder.length === this.seats.length) {
      this.setupExchange(); // rounds 2+ : Trou du cul ↔ Président, etc.
    } else {
      this.phase = "playing"; // round 1 opens on the 3 of clubs (set by deal)
    }
  }

  private deal(): void {
    const deck = this.fixedDeck ? [...this.fixedDeck] : shuffle(buildDeck(), this.rng);
    let seat = 0;
    for (const card of deck) {
      this.seats[seat % this.seats.length]!.hand.push(card);
      seat++;
    }
    // The holder of the 3 of clubs opens the first round.
    const opener = this.seats.findIndex((s) =>
      s.hand.some((c) => c.kind === "normal" && c.rank === "3" && c.suit === "clubs"),
    );
    this.currentIndex = opener === -1 ? 0 : opener;
  }

  /**
   * Sets up the inter-round exchange: each lower-ranked player automatically
   * gives their best cards up, and owes the higher-ranked player a return of the
   * same size (chosen via exchangeReturn).
   */
  private setupExchange(): void {
    const order = this.prevFinishingOrder;
    const n = this.seats.length;
    const pairs: Array<{ high: string; low: string; count: number }> = [
      { high: order[0]!, low: order[n - 1]!, count: 2 }, // Président ↔ Trou du cul
    ];
    if (n >= 4) pairs.push({ high: order[1]!, low: order[n - 2]!, count: 1 }); // Vice pair

    this.pendingReturns = [];
    for (const { high, low, count } of pairs) {
      const lowSeat = this.seatById(low)!;
      const highSeat = this.seatById(high)!;
      const best = [...lowSeat.hand]
        .sort((a, b) => exchangeStrength(b) - exchangeStrength(a))
        .slice(0, count);
      lowSeat.hand = removeCards(lowSeat.hand, best);
      highSeat.hand.push(...best);
      this.pendingReturns.push({ fromId: high, toId: low, count });
    }
    this.phase = "exchange";
  }

  /** A higher-ranked player returns cards to their paired lower-ranked player. */
  exchangeReturn(id: string, cards: PresidentCard[]): PresidentActionResult {
    if (this.phase !== "exchange") return fail("WRONG_PHASE");
    const owed = this.pendingReturns.find((r) => r.fromId === id);
    if (!owed) return fail("NO_RETURN_OWED");
    if (!Array.isArray(cards) || cards.length !== owed.count) return fail("WRONG_COUNT");

    const from = this.seatById(id)!;
    const owned = takeFromHand(from.hand, cards);
    if (!owned) return fail("NOT_IN_HAND");
    from.hand = removeCards(from.hand, owned);
    this.seatById(owed.toId)!.hand.push(...owned);

    this.pendingReturns = this.pendingReturns.filter((r) => r.fromId !== id);
    if (this.pendingReturns.length === 0) {
      // Exchange done → the previous Trou du cul leads.
      const leader = this.prevFinishingOrder[this.seats.length - 1]!;
      this.currentIndex = this.seats.findIndex((s) => s.id === leader);
      this.phase = "playing";
    }
    return OK;
  }

  /** Lay a combination of same-rank cards from your hand. */
  play(id: string, cards: PresidentCard[]): PresidentActionResult {
    if (this.phase !== "playing") return fail("WRONG_PHASE");
    const seat = this.seats[this.currentIndex]!;
    if (seat.id !== id) return fail("NOT_YOUR_TURN");
    if (!Array.isArray(cards) || cards.length === 0) return fail("INVALID_COMBO");

    const owned = takeFromHand(seat.hand, cards);
    if (!owned) return fail("NOT_IN_HAND");
    const key = comboKey(owned);
    if (key === null || owned.length > 4) return fail("INVALID_COMBO");

    if (this.pile) {
      if (owned.length !== this.pile.count) return fail("INVALID_COMBO");
      if (!canBeat(key, this.pile.key, this.reversed)) return fail("CANNOT_BEAT");
    }

    // Commit: remove the cards from the hand.
    seat.hand = removeCards(seat.hand, owned);
    const isBomb = key === "2";
    const isQuad = owned.length === 4;

    this.pile = { cards: owned, key, count: owned.length };
    this.lastPlayerIndex = this.currentIndex;
    if (isQuad) this.reversed = !this.reversed;

    const justFinished = seat.hand.length === 0;
    if (justFinished) this.finishSeat(seat);

    if (this.endIfRoundOver()) return OK;

    if (isBomb) {
      // The 2 clears the pile; its player leads again (or the next if they're out).
      this.clearPile();
      this.currentIndex = justFinished ? this.nextActiveFrom(this.currentIndex) : this.currentIndex;
      return OK;
    }

    this.advance();
    return OK;
  }

  /** Pass the current trick (not allowed when you'd be leading a fresh pile). */
  pass(id: string): PresidentActionResult {
    if (this.phase !== "playing") return fail("WRONG_PHASE");
    const seat = this.seats[this.currentIndex]!;
    if (seat.id !== id) return fail("NOT_YOUR_TURN");
    if (!this.pile) return fail("CANNOT_PASS_LEAD");
    seat.passed = true;
    this.advance();
    return OK;
  }

  getView(viewerId = ""): PresidentView {
    return {
      phase: this.phase,
      round: this.round,
      currentPlayerId: this.phase === "playing" ? (this.seats[this.currentIndex]?.id ?? null) : null,
      pile: this.pile
        ? { cards: this.pile.cards.map((c) => ({ ...c })), count: this.pile.count }
        : null,
      reversed: this.reversed,
      pot: this.pot,
      pendingReturns: this.pendingReturns.map((r) => ({ ...r })),
      finishingOrder: [...this.finishingOrder],
      players: this.seats.map((seat) => ({
        id: seat.id,
        nickname: seat.nickname,
        handCount: seat.hand.length,
        hand: seat.id === viewerId ? seat.hand.map((c) => ({ ...c })) : null,
        chips: seat.chips,
        lastNet: seat.lastNet,
        finished: seat.finished,
        rank: seat.finished ? this.finishingOrder.indexOf(seat.id) + 1 : null,
        passed: seat.passed,
      })),
    };
  }

  private finishSeat(seat: Seat): void {
    seat.finished = true;
    this.finishingOrder.push(seat.id);
  }

  /** Ends the round once only one player still holds cards (the Trou du cul). */
  private endIfRoundOver(): boolean {
    const active = this.seats.filter((s) => !s.finished);
    if (active.length > 1) return false;
    if (active.length === 1) this.finishSeat(active[0]!);
    this.settle();
    this.prevFinishingOrder = [...this.finishingOrder];
    this.phase = "done";
    this.pile = null;
    return true;
  }

  /** Pay the pot out by finishing rank (top-heavy, Trou du cul gets nothing). */
  private settle(): void {
    const n = this.seats.length;
    const order = this.finishingOrder;
    const totalWeight = (n * (n - 1)) / 2; // sum of 0..n-1
    const payouts = new Map<string, number>();
    let distributed = 0;
    for (let pos = 0; pos < n; pos++) {
      const weight = n - 1 - pos;
      const pay = totalWeight === 0 ? 0 : Math.floor((this.pot * weight) / totalWeight);
      payouts.set(order[pos]!, pay);
      distributed += pay;
    }
    // Rounding remainder goes to the Président.
    payouts.set(order[0]!, (payouts.get(order[0]!) ?? 0) + (this.pot - distributed));

    for (const seat of this.seats) {
      const pay = payouts.get(seat.id) ?? 0;
      seat.chips += pay;
      seat.lastNet = pay - seat.antePaid;
    }
    this.pot = 0;
  }

  private clearPile(): void {
    this.pile = null;
    for (const seat of this.seats) seat.passed = false;
  }

  /** Move to the next player; if everyone else has passed/finished, win the trick. */
  private advance(): void {
    const n = this.seats.length;
    for (let step = 1; step <= n; step++) {
      const idx = (this.currentIndex + step) % n;
      const seat = this.seats[idx]!;
      if (seat.finished || seat.passed) continue;
      if (idx === this.lastPlayerIndex) break; // back to the leader → trick over
      this.currentIndex = idx;
      return;
    }
    this.winTrick();
  }

  /** The last player to lay a combo takes the trick and leads the next one. */
  private winTrick(): void {
    const winner = this.lastPlayerIndex ?? this.currentIndex;
    this.clearPile();
    this.currentIndex = this.seats[winner]!.finished ? this.nextActiveFrom(winner) : winner;
    this.lastPlayerIndex = null;
  }

  /** Index of the first non-finished seat after `from`. */
  private nextActiveFrom(from: number): number {
    const n = this.seats.length;
    for (let step = 1; step <= n; step++) {
      const idx = (from + step) % n;
      if (!this.seats[idx]!.finished) return idx;
    }
    return from;
  }

  private seatById(id: string): Seat | undefined {
    return this.seats.find((s) => s.id === id);
  }
}

/** Builds the 54-card deck: a standard 52 plus two jokers. */
function buildDeck(): PresidentCard[] {
  const cards: PresidentCard[] = createDeck(1).map((c) => ({
    kind: "normal",
    suit: c.suit,
    rank: c.rank,
  }));
  cards.push({ kind: "joker", id: 0 }, { kind: "joker", id: 1 });
  return cards;
}

/** Fisher-Yates with injected rng (generic — jokers aren't standard cards). */
function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = result[i]!;
    result[i] = result[j]!;
    result[j] = a;
  }
  return result;
}

function cardKey(card: PresidentCard): CardKey {
  return card.kind === "joker" ? "joker" : card.rank;
}

/** Returns the shared key if every card is the same rank, else null. */
function comboKey(cards: PresidentCard[]): CardKey | null {
  const key = cardKey(cards[0]!);
  return cards.every((c) => cardKey(c) === key) ? key : null;
}

/** Strength of a normal rank, honoring révolution. */
function normalStrength(key: CardKey, reversed: boolean): number {
  const idx = PRESIDENT_NORMAL_ORDER.indexOf(key as never);
  return reversed ? PRESIDENT_NORMAL_ORDER.length - 1 - idx : idx;
}

/** Can a candidate combo (same count) beat the pile's top? */
function canBeat(candidate: CardKey, pile: CardKey, reversed: boolean): boolean {
  if (candidate === "2") return true; // the bomb beats anything
  if (pile === "joker") return false; // only a 2 beats jokers
  if (candidate === "joker") return true; // jokers beat any normal combo
  return normalStrength(candidate, reversed) > normalStrength(pile, reversed);
}

/** Absolute strength for picking "best" cards in the exchange (joker > 2 > A > … > 3). */
function exchangeStrength(card: PresidentCard): number {
  const key = cardKey(card);
  if (key === "joker") return 100;
  if (key === "2") return 50;
  return PRESIDENT_NORMAL_ORDER.indexOf(key as never);
}

/**
 * Confirms the seat owns the requested cards (matching jokers by id, normals by
 * suit+rank), returning the matched hand instances, or null if any is missing.
 */
function takeFromHand(hand: PresidentCard[], cards: PresidentCard[]): PresidentCard[] | null {
  const remaining = [...hand];
  const matched: PresidentCard[] = [];
  for (const card of cards) {
    const idx = remaining.findIndex((h) => sameCard(h, card));
    if (idx === -1) return null;
    matched.push(remaining[idx]!);
    remaining.splice(idx, 1);
  }
  return matched;
}

function removeCards(hand: PresidentCard[], cards: PresidentCard[]): PresidentCard[] {
  const result = [...hand];
  for (const card of cards) {
    const idx = result.findIndex((h) => sameCard(h, card));
    if (idx !== -1) result.splice(idx, 1);
  }
  return result;
}

function sameCard(a: PresidentCard, b: PresidentCard): boolean {
  if (a.kind === "joker" && b.kind === "joker") return a.id === b.id;
  if (a.kind === "normal" && b.kind === "normal") return a.suit === b.suit && a.rank === b.rank;
  return false;
}
