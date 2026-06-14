import type { Rng } from "../../random";
import { createDeck, shuffle, type Card } from "../../deck";
import { compareHands, evaluateHand, HAND_NAMES_FR, type HandScore } from "./evaluate";
import type { PokerPhase, PokerSettings, PokerView } from "./types";

export type PokerError =
  | "WRONG_PHASE"
  | "NOT_YOUR_TURN"
  | "UNKNOWN_PLAYER"
  | "INVALID_RAISE"
  | "CANNOT_CHECK"
  | "CANNOT_REBUY"
  | "NOT_ENOUGH_PLAYERS";

export type PokerActionResult = { ok: true } | { ok: false; error: PokerError };

const OK: PokerActionResult = { ok: true };
const fail = (error: PokerError): PokerActionResult => ({ ok: false, error });

interface Seat {
  id: string;
  nickname: string;
  chips: number;
  holeCards: Card[];
  betThisStreet: number;
  /** Total wagered this hand; stays in the pot even after folding. */
  committed: number;
  folded: boolean;
  /** Not dealt into the current hand (joined mid-hand, busted, or waiting). */
  sittingOut: boolean;
  /** Has acted since the last full raise on this street. */
  acted: boolean;
  revealed: boolean;
  result: { winnings: number; handName: string | null } | null;
}

/**
 * Authoritative no-limit Texas Hold'em cash game. Pure state machine, rng
 * injected. Hole cards are private: clients must only ever receive
 * `getViewFor(playerId)`, never the raw seats.
 *
 * Hand flow: blinds posted -> preflop -> flop -> turn -> river -> showdown
 * (also reached early when everyone else folds, or by dealing out the board
 * when players are all-in). Uncalled bets are refunded; side pots are split
 * by committed amounts.
 */
export class PokerGame {
  private seats: Seat[] = [];
  private deck: Card[] = [];
  private community: Card[] = [];
  private phase: PokerPhase = "waiting";
  private dealerIndex = -1;
  private currentIndex = -1;
  private currentBet = 0;
  /** Size of the last full raise; the next raise must be at least as big. */
  private minRaise = 0;
  private handNumber = 0;
  private winners: PokerView["winners"] = null;

  constructor(
    players: ReadonlyArray<{ id: string; nickname: string; chips?: number }>,
    private settings: PokerSettings,
    private readonly rng: Rng = Math.random,
  ) {
    for (const player of players) {
      this.addPlayer(player.id, player.nickname, player.chips);
    }
    this.startHand();
  }

  /** Raise the blinds — used by tournament escalation; applies from the next hand. */
  setBlinds(smallBlind: number, bigBlind: number): void {
    if (Number.isInteger(smallBlind) && smallBlind > 0 && bigBlind >= smallBlind) {
      this.settings = { ...this.settings, smallBlind, bigBlind };
    }
  }

  /** Late joiners sit out until the next hand starts. */
  addPlayer(id: string, nickname: string, chips = this.settings.startingChips): void {
    if (this.seats.some((seat) => seat.id === id)) return;
    this.seats.push({
      id,
      nickname,
      chips,
      holeCards: [],
      betThisStreet: 0,
      committed: 0,
      folded: false,
      sittingOut: true,
      acted: false,
      revealed: false,
      result: null,
    });
  }

  removePlayer(id: string): void {
    const index = this.seats.findIndex((seat) => seat.id === id);
    if (index === -1) return;
    const seat = this.seats[index]!;

    // A player leaving mid-hand folds; their committed chips stay in the pot
    if (this.isBettingPhase() && !seat.sittingOut && !seat.folded) {
      seat.folded = true;
      const inHand = this.seats.filter((s) => !s.sittingOut && !s.folded);
      if (inHand.length === 1) {
        this.awardFoldWin(inHand[0]!);
      } else if (this.currentIndex === index) {
        const next = this.nextActorIndex(index);
        if (next !== -1) this.currentIndex = next;
        else this.advanceStreet();
      }
    }

    this.seats.splice(index, 1);
    if (index < this.currentIndex) this.currentIndex--;
    else if (index === this.currentIndex) this.currentIndex = -1;
    if (index <= this.dealerIndex) this.dealerIndex = Math.max(-1, this.dealerIndex - 1);
  }

  fold(id: string): PokerActionResult {
    const turn = this.requireTurn(id);
    if (!turn.ok) return turn;
    turn.seat.folded = true;
    this.afterAction();
    return OK;
  }

  check(id: string): PokerActionResult {
    const turn = this.requireTurn(id);
    if (!turn.ok) return turn;
    if (this.currentBet > turn.seat.betThisStreet) return fail("CANNOT_CHECK");
    turn.seat.acted = true;
    this.afterAction();
    return OK;
  }

  call(id: string): PokerActionResult {
    const turn = this.requireTurn(id);
    if (!turn.ok) return turn;
    const seat = turn.seat;
    const pay = Math.min(this.currentBet - seat.betThisStreet, seat.chips);
    if (pay > 0) this.commit(seat, pay);
    seat.acted = true;
    this.afterAction();
    return OK;
  }

  /** No-limit bet/raise, expressed as the total target for this street. */
  raiseTo(id: string, amount: number): PokerActionResult {
    const turn = this.requireTurn(id);
    if (!turn.ok) return turn;
    const seat = turn.seat;
    if (!Number.isInteger(amount) || amount <= this.currentBet) return fail("INVALID_RAISE");
    const pay = amount - seat.betThisStreet;
    if (pay <= 0 || pay > seat.chips) return fail("INVALID_RAISE");

    const raiseSize = amount - this.currentBet;
    const isAllIn = pay === seat.chips;
    if (raiseSize < this.minRaise && !isAllIn) return fail("INVALID_RAISE");

    this.commit(seat, pay);
    if (raiseSize >= this.minRaise) {
      // A full raise reopens the action for everyone else
      this.minRaise = raiseSize;
      for (const other of this.seats) {
        if (other !== seat) other.acted = false;
      }
    }
    this.currentBet = amount;
    seat.acted = true;
    this.afterAction();
    return OK;
  }

  nextHand(): PokerActionResult {
    if (this.phase !== "showdown" && this.phase !== "waiting") return fail("WRONG_PHASE");
    if (!this.startHand()) return fail("NOT_ENOUGH_PLAYERS");
    return OK;
  }

  /** Fictional chips: broke players can refill between hands. */
  rebuy(id: string): PokerActionResult {
    const seat = this.seats.find((s) => s.id === id);
    if (!seat) return fail("UNKNOWN_PLAYER");
    const midHand = this.isBettingPhase() && !seat.sittingOut;
    if (midHand || seat.chips >= this.settings.bigBlind) return fail("CANNOT_REBUY");
    seat.chips = this.settings.startingChips;
    return OK;
  }

  getViewFor(viewerId: string): PokerView {
    const currentSeat = this.seats[this.currentIndex];
    return {
      phase: this.phase,
      handNumber: this.handNumber,
      community: [...this.community],
      pot: this.seats.reduce((sum, seat) => sum + seat.committed, 0),
      currentPlayerId: currentSeat?.id ?? null,
      currentBet: this.currentBet,
      players: this.seats.map((seat, index) => ({
        id: seat.id,
        nickname: seat.nickname,
        chips: seat.chips,
        betThisStreet: seat.betThisStreet,
        committed: seat.committed,
        folded: seat.folded,
        allIn: !seat.sittingOut && !seat.folded && seat.chips === 0 && seat.committed > 0,
        sittingOut: seat.sittingOut,
        isDealer: index === this.dealerIndex && this.phase !== "waiting",
        holeCards:
          (seat.id === viewerId || seat.revealed) && seat.holeCards.length > 0
            ? [...seat.holeCards]
            : null,
        holeCardCount: seat.sittingOut || seat.folded ? 0 : seat.holeCards.length,
        result: seat.result,
      })),
      settings: { ...this.settings },
      turn:
        currentSeat?.id === viewerId && this.isBettingPhase()
          ? this.turnOptions(currentSeat)
          : null,
      canStartHand:
        (this.phase === "showdown" || this.phase === "waiting") &&
        this.seats.filter((seat) => seat.chips > 0).length >= 2,
      winners: this.winners ? this.winners.map((winner) => ({ ...winner })) : null,
    };
  }

  private turnOptions(seat: Seat): PokerView["turn"] {
    const toCall = Math.min(this.currentBet - seat.betThisStreet, seat.chips);
    const maxRaiseTo = seat.betThisStreet + seat.chips;
    return {
      toCall,
      canCheck: toCall <= 0,
      canRaise: maxRaiseTo > this.currentBet,
      minRaiseTo: Math.min(this.currentBet + this.minRaise, maxRaiseTo),
      maxRaiseTo,
    };
  }

  private startHand(): boolean {
    for (const seat of this.seats) {
      seat.holeCards = [];
      seat.betThisStreet = 0;
      seat.committed = 0;
      seat.folded = false;
      seat.acted = false;
      seat.revealed = false;
      seat.result = null;
      seat.sittingOut = seat.chips <= 0;
    }
    this.community = [];
    this.winners = null;
    this.currentBet = 0;

    const playing = this.seats.filter((seat) => !seat.sittingOut);
    if (playing.length < 2) {
      this.phase = "waiting";
      this.currentIndex = -1;
      return false;
    }

    this.handNumber++;
    this.deck = shuffle(createDeck(1), this.rng);
    this.dealerIndex = this.nextPlayingIndex(this.dealerIndex);

    // Heads-up: the dealer posts the small blind and acts first preflop
    const headsUp = playing.length === 2;
    const sbIndex = headsUp ? this.dealerIndex : this.nextPlayingIndex(this.dealerIndex);
    const bbIndex = this.nextPlayingIndex(sbIndex);
    this.commit(this.seats[sbIndex]!, Math.min(this.settings.smallBlind, this.seats[sbIndex]!.chips));
    this.commit(this.seats[bbIndex]!, Math.min(this.settings.bigBlind, this.seats[bbIndex]!.chips));

    for (let pass = 0; pass < 2; pass++) {
      let index = this.nextPlayingIndex(this.dealerIndex);
      for (let dealt = 0; dealt < playing.length; dealt++) {
        this.seats[index]!.holeCards.push(this.deck.pop()!);
        index = this.nextPlayingIndex(index);
      }
    }

    this.phase = "preflop";
    this.currentBet = this.settings.bigBlind;
    this.minRaise = this.settings.bigBlind;
    this.currentIndex = this.nextActorIndex(bbIndex);
    if (this.currentIndex === -1) this.advanceStreet(); // blinds put everyone all-in
    return true;
  }

  private afterAction(): void {
    const inHand = this.seats.filter((seat) => !seat.sittingOut && !seat.folded);
    if (inHand.length === 1) return this.awardFoldWin(inHand[0]!);
    const next = this.nextActorIndex(this.currentIndex);
    if (next !== -1) {
      this.currentIndex = next;
      return;
    }
    this.advanceStreet();
  }

  private advanceStreet(): void {
    for (const seat of this.seats) {
      seat.betThisStreet = 0;
      seat.acted = false;
    }
    this.currentBet = 0;
    this.minRaise = this.settings.bigBlind;

    if (this.phase === "preflop") {
      this.community.push(this.deck.pop()!, this.deck.pop()!, this.deck.pop()!);
      this.phase = "flop";
    } else if (this.phase === "flop") {
      this.community.push(this.deck.pop()!);
      this.phase = "turn";
    } else if (this.phase === "turn") {
      this.community.push(this.deck.pop()!);
      this.phase = "river";
    } else {
      return this.showdown();
    }

    // With fewer than two players able to act, betting is moot: deal it out
    const actors = this.seats.filter((seat) => this.canAct(seat));
    if (actors.length < 2) return this.advanceStreet();
    this.currentIndex = this.nextActorIndex(this.dealerIndex);
  }

  private awardFoldWin(winner: Seat): void {
    this.refundUncalled();
    const pot = this.seats.reduce((sum, seat) => sum + seat.committed, 0);
    winner.chips += pot;
    winner.result = { winnings: pot, handName: null };
    this.winners = [{ playerId: winner.id, amount: pot, handName: null }];
    this.phase = "showdown";
    this.currentIndex = -1;
  }

  private showdown(): void {
    this.refundUncalled();
    const contenders = this.seats.filter((seat) => !seat.sittingOut && !seat.folded);
    const scores = new Map<Seat, HandScore>();
    for (const seat of contenders) {
      seat.revealed = true;
      const score = evaluateHand([...seat.holeCards, ...this.community]);
      scores.set(seat, score);
      seat.result = { winnings: 0, handName: HAND_NAMES_FR[score.categoryName] };
    }

    // Side pots: slice the pot by the distinct all-in levels of the contenders
    const levels = [...new Set(contenders.map((seat) => seat.committed))].sort((a, b) => a - b);
    let previous = 0;
    for (const level of levels) {
      let portion = 0;
      for (const seat of this.seats) {
        portion += Math.max(0, Math.min(seat.committed, level) - previous);
      }
      const eligible = contenders.filter((seat) => seat.committed >= level);
      let best: Seat[] = [];
      for (const seat of eligible) {
        const diff = best.length === 0 ? 1 : compareHands(scores.get(seat)!, scores.get(best[0]!)!);
        if (diff > 0) best = [seat];
        else if (diff === 0) best.push(seat);
      }
      const share = Math.floor(portion / best.length);
      let remainder = portion - share * best.length;
      for (const seat of best) {
        const amount = share + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder--;
        seat.chips += amount;
        seat.result!.winnings += amount;
      }
      previous = level;
    }

    this.winners = contenders
      .filter((seat) => seat.result!.winnings > 0)
      .map((seat) => ({
        playerId: seat.id,
        amount: seat.result!.winnings,
        handName: seat.result!.handName,
      }));
    this.phase = "showdown";
    this.currentIndex = -1;
  }

  /** Returns the part of the highest bet that nobody matched. */
  private refundUncalled(): void {
    const contenders = this.seats.filter((seat) => !seat.sittingOut && !seat.folded);
    let top: Seat | null = null;
    for (const seat of contenders) {
      if (!top || seat.committed > top.committed) top = seat;
    }
    if (!top) return;
    let second = 0;
    for (const seat of this.seats) {
      if (seat !== top) second = Math.max(second, seat.committed);
    }
    if (top.committed > second) {
      const refund = top.committed - second;
      top.chips += refund;
      top.committed -= refund;
      top.betThisStreet = Math.max(0, top.betThisStreet - refund);
    }
  }

  private commit(seat: Seat, amount: number): void {
    seat.chips -= amount;
    seat.betThisStreet += amount;
    seat.committed += amount;
  }

  private canAct(seat: Seat): boolean {
    return !seat.sittingOut && !seat.folded && seat.chips > 0;
  }

  private isBettingPhase(): boolean {
    return (
      this.phase === "preflop" ||
      this.phase === "flop" ||
      this.phase === "turn" ||
      this.phase === "river"
    );
  }

  /** Next seat dealt into the hand, cyclic. */
  private nextPlayingIndex(from: number): number {
    const length = this.seats.length;
    for (let step = 1; step <= length; step++) {
      const index = (from + step + length) % length;
      if (!this.seats[index]!.sittingOut) return index;
    }
    return -1;
  }

  /** Next seat that still has to act on this street, cyclic; -1 if none. */
  private nextActorIndex(from: number): number {
    const length = this.seats.length;
    for (let step = 1; step <= length; step++) {
      const index = (from + step + length) % length;
      const seat = this.seats[index]!;
      if (this.canAct(seat) && !seat.acted) return index;
    }
    return -1;
  }

  private requireTurn(id: string): { ok: true; seat: Seat } | { ok: false; error: PokerError } {
    if (!this.isBettingPhase()) return { ok: false, error: "WRONG_PHASE" };
    const seat = this.seats[this.currentIndex];
    if (!seat || seat.id !== id) return { ok: false, error: "NOT_YOUR_TURN" };
    return { ok: true, seat };
  }
}
