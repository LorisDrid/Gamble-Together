import type { Rng } from "../../random";
import { createDeck, shuffle, type Card } from "../../deck";
import { dealerShouldHit, handValue, isBust, payout, roundResult } from "./hands";
import {
  BLACKJACK_DEALER_ID,
  BLACKJACK_MODIFIER_CAP,
  BLACKJACK_PROC_CHANCE,
  type BlackjackPhase,
  type BlackjackPower,
  type BlackjackPowerKind,
  type BlackjackSettings,
  type BlackjackView,
  type RoundResult,
} from "./types";

export type BlackjackError =
  | "WRONG_PHASE"
  | "CANNOT_ACT"
  | "UNKNOWN_PLAYER"
  | "INVALID_BET"
  | "ALREADY_BET"
  | "CANNOT_REBUY"
  | "NO_POWER"
  | "INVALID_POWER"
  | "INVALID_TARGET";

export type BlackjackActionResult = { ok: true } | { ok: false; error: BlackjackError };

const OK: BlackjackActionResult = { ok: true };
const fail = (error: BlackjackError): BlackjackActionResult => ({ ok: false, error });

interface Seat {
  id: string;
  nickname: string;
  chips: number;
  bet: number | null;
  hand: Card[];
  inRound: boolean;
  hasStood: boolean;
  result: RoundResult | null;
  // --- Sabotage mode (reset every round) ---
  /** Net ±total modifier from powers applied to this hand. */
  modifier: number;
  /** A procced power awaiting use/skip; blocks settlement until resolved. */
  pendingPower: BlackjackPowerKind | null;
  /** True once this seat has procced its one power for the round. */
  procUsed: boolean;
  /** The card that procced (marked special for the client), if any. */
  specialCard: Card | null;
}

/**
 * Authoritative blackjack table. Pure state machine: no I/O, no timers,
 * randomness comes from the injected rng. The server owns the instance;
 * clients only ever see `getView()`.
 *
 * Round flow: betting (everyone who can afford minBet must bet)
 * -> playing (all players act IN PARALLEL — each hits/stands independently,
 *    no turn order)
 * -> once every player has finished, the dealer draws and chips settle
 * -> payout -> nextRound() -> betting.
 */
export class BlackjackGame {
  private seats: Seat[] = [];
  private deck: Card[];
  private dealerHand: Card[] = [];
  private dealerModifier = 0;
  private phase: BlackjackPhase = "betting";
  private round = 1;

  constructor(
    players: ReadonlyArray<{ id: string; nickname: string }>,
    private settings: BlackjackSettings,
    private readonly rng: Rng = Math.random,
  ) {
    this.deck = shuffle(createDeck(settings.deckCount), rng);
    for (const player of players) {
      this.addPlayer(player.id, player.nickname);
    }
  }

  /** Raise (or change) the table minimum — used by tournament escalation. */
  setMinBet(minBet: number): void {
    if (Number.isInteger(minBet) && minBet > 0) {
      this.settings = { ...this.settings, minBet };
    }
  }

  /** Late joiners sit out the current round and play from the next one. */
  addPlayer(id: string, nickname: string): void {
    if (this.seats.some((seat) => seat.id === id)) return;
    this.seats.push({
      id,
      nickname,
      chips: this.settings.startingChips,
      bet: null,
      hand: [],
      inRound: false,
      hasStood: false,
      result: null,
      modifier: 0,
      pendingPower: null,
      procUsed: false,
      specialCard: null,
    });
  }

  removePlayer(id: string): void {
    const index = this.seats.findIndex((seat) => seat.id === id);
    if (index === -1) return;
    this.seats.splice(index, 1);
    // The departed player may have been the last one we were waiting on
    if (this.phase === "betting") this.maybeDeal();
    else if (this.phase === "playing") this.maybeSettle();
  }

  placeBet(id: string, amount: number): BlackjackActionResult {
    if (this.phase !== "betting") return fail("WRONG_PHASE");
    const seat = this.seats.find((s) => s.id === id);
    if (!seat) return fail("UNKNOWN_PLAYER");
    if (seat.bet !== null) return fail("ALREADY_BET");
    if (!Number.isInteger(amount) || amount < this.settings.minBet || amount > seat.chips) {
      return fail("INVALID_BET");
    }
    seat.chips -= amount;
    seat.bet = amount;
    seat.inRound = true;
    this.maybeDeal();
    return OK;
  }

  /** Fictional chips: broke players can refill to the starting stack between rounds. */
  rebuy(id: string): BlackjackActionResult {
    if (this.phase !== "betting") return fail("WRONG_PHASE");
    const seat = this.seats.find((s) => s.id === id);
    if (!seat) return fail("UNKNOWN_PLAYER");
    if (seat.bet !== null || seat.chips >= this.settings.minBet) return fail("CANNOT_REBUY");
    seat.chips = this.settings.startingChips;
    return OK;
  }

  hit(id: string): BlackjackActionResult {
    const seat = this.requireActor(id);
    if (!seat.ok) return seat;
    const card = this.draw();
    seat.seat.hand.push(card);
    this.maybeProc(seat.seat, card);
    // Reaching 21+ ends this player's action; the dealer waits for everyone
    this.maybeSettle();
    return OK;
  }

  /** Sabotage mode: a Valet drawn on a hit may become a special "Valet Saboteur". */
  private maybeProc(seat: Seat, card: Card): void {
    if (!this.settings.sabotage) return;
    if (seat.procUsed || seat.pendingPower !== null || card.rank !== "J") return;
    if (this.rng() < BLACKJACK_PROC_CHANCE) {
      seat.pendingPower = "modulate";
      seat.specialCard = card;
      seat.procUsed = true;
    }
  }

  /**
   * Spend a procced power. Real-time, instant: the owner picks target + effect
   * and it resolves immediately. Doesn't end the owner's turn (they may still
   * hit/stand) unless it pushed their own effective total to 21+.
   */
  usePower(id: string, power: BlackjackPower): BlackjackActionResult {
    if (this.phase !== "playing") return fail("WRONG_PHASE");
    const seat = this.seats.find((s) => s.id === id);
    if (!seat) return fail("UNKNOWN_PLAYER");
    if (seat.pendingPower === null) return fail("NO_POWER");
    if (power?.kind !== seat.pendingPower) return fail("INVALID_POWER");
    if (power.kind === "modulate") {
      if (power.delta !== 1 && power.delta !== -1) return fail("INVALID_POWER");
      if (!this.applyModulate(power.targetId, power.delta)) return fail("INVALID_TARGET");
    }
    seat.pendingPower = null;
    this.maybeSettle();
    return OK;
  }

  /** Decline a procced power (resolve it without effect so the round can settle). */
  skipPower(id: string): BlackjackActionResult {
    if (this.phase !== "playing") return fail("WRONG_PHASE");
    const seat = this.seats.find((s) => s.id === id);
    if (!seat) return fail("UNKNOWN_PLAYER");
    if (seat.pendingPower === null) return fail("NO_POWER");
    seat.pendingPower = null;
    this.maybeSettle();
    return OK;
  }

  /** Applies a ±1 to a seat (or the dealer), clamped to the cap. */
  private applyModulate(targetId: string, delta: number): boolean {
    if (targetId === BLACKJACK_DEALER_ID) {
      this.dealerModifier = clampModifier(this.dealerModifier + delta);
      return true;
    }
    // Any participating seat is targetable until the dealer plays — even a
    // player who has already stood or busted.
    const target = this.seats.find((s) => s.id === targetId);
    if (!target || !target.inRound) return false;
    target.modifier = clampModifier(target.modifier + delta);
    return true;
  }

  stand(id: string): BlackjackActionResult {
    const seat = this.requireActor(id);
    if (!seat.ok) return seat;
    seat.seat.hasStood = true;
    this.maybeSettle();
    return OK;
  }

  nextRound(): BlackjackActionResult {
    if (this.phase !== "payout") return fail("WRONG_PHASE");
    this.round++;
    this.dealerHand = [];
    this.dealerModifier = 0;
    for (const seat of this.seats) {
      seat.bet = null;
      seat.hand = [];
      seat.inRound = false;
      seat.hasStood = false;
      seat.result = null;
      seat.modifier = 0;
      seat.pendingPower = null;
      seat.procUsed = false;
      seat.specialCard = null;
    }
    this.phase = "betting";
    return OK;
  }

  getView(): BlackjackView {
    const hideHole = this.phase === "playing" && this.dealerHand.length > 1;
    return {
      phase: this.phase,
      round: this.round,
      players: this.seats.map((seat) => ({
        id: seat.id,
        nickname: seat.nickname,
        chips: seat.chips,
        bet: seat.bet,
        hand: seat.hand.map((card) =>
          card === seat.specialCard ? { ...card, special: true } : { ...card },
        ),
        inRound: seat.inRound,
        hasStood: seat.hasStood,
        result: seat.result,
        // A player can still act while in the round, not stood, and under 21
        canAct: this.phase === "playing" && this.canAct(seat),
        modifier: seat.modifier,
        pendingPower: seat.pendingPower,
      })),
      dealerHand: hideHole ? this.dealerHand.slice(0, 1) : [...this.dealerHand],
      dealerHiddenCard: hideHole,
      dealerModifier: this.dealerModifier,
      settings: { ...this.settings },
    };
  }

  /** True while the seat still has a decision to make this round. */
  private canAct(seat: Seat): boolean {
    return seat.inRound && !seat.hasStood && handValue(seat.hand).total + seat.modifier < 21;
  }

  private requireActor(id: string): { ok: true; seat: Seat } | { ok: false; error: BlackjackError } {
    if (this.phase !== "playing") return { ok: false, error: "WRONG_PHASE" };
    const seat = this.seats.find((s) => s.id === id);
    if (!seat) return { ok: false, error: "UNKNOWN_PLAYER" };
    if (!this.canAct(seat)) return { ok: false, error: "CANNOT_ACT" };
    return { ok: true, seat };
  }

  private maybeDeal(): void {
    if (this.phase !== "betting") return;
    const stillBetting = this.seats.some(
      (seat) => seat.bet === null && seat.chips >= this.settings.minBet,
    );
    const anyBet = this.seats.some((seat) => seat.bet !== null);
    if (anyBet && !stillBetting) this.deal();
  }

  private deal(): void {
    const inRound = this.seats.filter((seat) => seat.inRound);
    // Reshuffle the shoe before it can run out mid-round
    if (this.deck.length < (inRound.length + 1) * 8) {
      this.deck = shuffle(createDeck(this.settings.deckCount), this.rng);
    }
    for (let pass = 0; pass < 2; pass++) {
      for (const seat of inRound) seat.hand.push(this.draw());
      this.dealerHand.push(this.draw());
    }
    this.phase = "playing";
    // Everyone could already be done (e.g. all dealt a natural 21)
    this.maybeSettle();
  }

  private draw(): Card {
    const card = this.deck.pop();
    if (card) return card;
    this.deck = shuffle(createDeck(this.settings.deckCount), this.rng);
    return this.deck.pop()!;
  }

  /** Once no in-round player can still act, the dealer draws and we settle. */
  private maybeSettle(): void {
    if (this.phase !== "playing") return;
    if (this.seats.some((seat) => this.canAct(seat))) return;
    // A procced power keeps the round open (it can still un-bust / swing a hand).
    if (this.seats.some((seat) => seat.inRound && seat.pendingPower !== null)) return;
    this.settleRound();
  }

  private settleRound(): void {
    const contenders = this.seats.some((seat) => seat.inRound && !isBust(seat.hand, seat.modifier));
    if (contenders) {
      while (dealerShouldHit(this.dealerHand, this.dealerModifier)) {
        this.dealerHand.push(this.draw());
      }
    }
    for (const seat of this.seats) {
      if (!seat.inRound || seat.bet === null) continue;
      seat.result = roundResult(seat.hand, this.dealerHand, seat.modifier, this.dealerModifier);
      seat.chips += payout(seat.bet, seat.result);
    }
    this.phase = "payout";
  }
}

/** Clamp a hand's net modifier to the allowed range. */
function clampModifier(value: number): number {
  return Math.max(-BLACKJACK_MODIFIER_CAP, Math.min(BLACKJACK_MODIFIER_CAP, value));
}
