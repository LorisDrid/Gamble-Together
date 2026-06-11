import type { Rng } from "../../random";
import { createDeck, shuffle, type Card } from "../../deck";
import { dealerShouldHit, handValue, isBust, payout, roundResult } from "./hands";
import type { BlackjackPhase, BlackjackSettings, BlackjackView, RoundResult } from "./types";

export type BlackjackError =
  | "WRONG_PHASE"
  | "NOT_YOUR_TURN"
  | "UNKNOWN_PLAYER"
  | "INVALID_BET"
  | "ALREADY_BET"
  | "CANNOT_REBUY";

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
}

/**
 * Authoritative blackjack table. Pure state machine: no I/O, no timers,
 * randomness comes from the injected rng. The server owns the instance;
 * clients only ever see `getView()`.
 *
 * Round flow: betting (everyone who can afford minBet must bet)
 * -> playing (turns in seat order, hit/stand)
 * -> payout (dealer drew, chips settled) -> nextRound() -> betting.
 */
export class BlackjackGame {
  private seats: Seat[] = [];
  private deck: Card[];
  private dealerHand: Card[] = [];
  private phase: BlackjackPhase = "betting";
  private currentIndex = -1;
  private round = 1;

  constructor(
    players: ReadonlyArray<{ id: string; nickname: string }>,
    private readonly settings: BlackjackSettings,
    private readonly rng: Rng = Math.random,
  ) {
    this.deck = shuffle(createDeck(settings.deckCount), rng);
    for (const player of players) {
      this.addPlayer(player.id, player.nickname);
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
    });
  }

  removePlayer(id: string): void {
    const index = this.seats.findIndex((seat) => seat.id === id);
    if (index === -1) return;
    const wasCurrent = this.phase === "playing" && index === this.currentIndex;
    this.seats.splice(index, 1);
    if (this.phase === "playing") {
      if (index < this.currentIndex) {
        this.currentIndex--;
      } else if (wasCurrent) {
        this.currentIndex--;
        this.advanceTurn();
      }
    } else if (this.phase === "betting") {
      // The departed player may have been the last one holding up the deal
      this.maybeDeal();
    }
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
    const turn = this.requireTurn(id);
    if (!turn.ok) return turn;
    turn.seat.hand.push(this.draw());
    if (handValue(turn.seat.hand).total >= 21) this.advanceTurn();
    return OK;
  }

  stand(id: string): BlackjackActionResult {
    const turn = this.requireTurn(id);
    if (!turn.ok) return turn;
    turn.seat.hasStood = true;
    this.advanceTurn();
    return OK;
  }

  nextRound(): BlackjackActionResult {
    if (this.phase !== "payout") return fail("WRONG_PHASE");
    this.round++;
    this.dealerHand = [];
    for (const seat of this.seats) {
      seat.bet = null;
      seat.hand = [];
      seat.inRound = false;
      seat.hasStood = false;
      seat.result = null;
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
        hand: [...seat.hand],
        inRound: seat.inRound,
        hasStood: seat.hasStood,
        result: seat.result,
      })),
      dealerHand: hideHole ? this.dealerHand.slice(0, 1) : [...this.dealerHand],
      dealerHiddenCard: hideHole,
      currentPlayerId: this.seats[this.currentIndex]?.id ?? null,
      settings: { ...this.settings },
    };
  }

  private requireTurn(id: string): { ok: true; seat: Seat } | { ok: false; error: BlackjackError } {
    if (this.phase !== "playing") return { ok: false, error: "WRONG_PHASE" };
    const seat = this.seats[this.currentIndex];
    if (!seat || seat.id !== id) return { ok: false, error: "NOT_YOUR_TURN" };
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
    this.currentIndex = -1;
    this.advanceTurn();
  }

  private draw(): Card {
    const card = this.deck.pop();
    if (card) return card;
    this.deck = shuffle(createDeck(this.settings.deckCount), this.rng);
    return this.deck.pop()!;
  }

  /** Skips seats that are done (stood, busted, sitting out, or already at 21). */
  private advanceTurn(): void {
    let next = this.currentIndex + 1;
    while (next < this.seats.length) {
      const seat = this.seats[next]!;
      if (seat.inRound && !seat.hasStood && handValue(seat.hand).total < 21) break;
      next++;
    }
    this.currentIndex = next;
    if (next >= this.seats.length) this.settleRound();
  }

  private settleRound(): void {
    const contenders = this.seats.some((seat) => seat.inRound && !isBust(seat.hand));
    if (contenders) {
      while (dealerShouldHit(this.dealerHand)) this.dealerHand.push(this.draw());
    }
    for (const seat of this.seats) {
      if (!seat.inRound || seat.bet === null) continue;
      seat.result = roundResult(seat.hand, this.dealerHand);
      seat.chips += payout(seat.bet, seat.result);
    }
    this.phase = "payout";
    this.currentIndex = -1;
  }
}
