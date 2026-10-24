import type { Rng } from "../../random";
import { createDeck, shuffle, type Card } from "../../deck";
import { dealerShouldHit, handValue, isBust, payout, roundResult } from "./hands";
import {
  BLACKJACK_DEALER_ID,
  BLACKJACK_DEALER_HITS_CAP,
  BLACKJACK_MODIFIER_CAP,
  BLACKJACK_PROC_CHANCE,
  type BlackjackCard,
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

/** One hand of a seat. A seat has one hand, or two after a split. */
interface Hand {
  cards: Card[];
  bet: number;
  doubled: boolean;
  hasStood: boolean;
  /** True for the two hands produced by a split (a 21 on them pays 1:1, not 3:2). */
  fromSplit: boolean;
  result: RoundResult | null;
}

interface Seat {
  id: string;
  nickname: string;
  chips: number;
  /** Base wager placed this round (null until bet). Each split hand stakes this. */
  bet: number | null;
  /** Empty while betting; one hand after the deal, two after a split. */
  hands: Hand[];
  inRound: boolean;
  // --- Sabotage mode (reset every round; split is disabled when sabotage is on,
  // so a seat with powers always has exactly one hand) ---
  /** Net ±total modifier from powers applied to this seat's hand. */
  modifier: number;
  /** A procced power awaiting use/skip; blocks settlement until resolved. */
  pendingPower: BlackjackPowerKind | null;
  /** True once this seat has procced its one power for the round. */
  procUsed: boolean;
  /** The card that procced (marked special for the client), if any. */
  specialCard: Card | null;
  /** True while this seat is shielded against others' sabotage (As power). */
  shielded: boolean;
  /**
   * Whether this seat's special card / power is now public. Set when a Valet is
   * activated, or when a shield blocks its first attack — so a shield stays
   * hidden until it actually triggers.
   */
  revealed: boolean;
}

/**
 * Authoritative blackjack table. Pure state machine: no I/O, no timers,
 * randomness comes from the injected rng. The server owns the instance;
 * clients only ever see `getView()`.
 *
 * Round flow: betting (everyone who can afford minBet must bet)
 * -> playing (all players act IN PARALLEL — each hits/stands independently,
 *    no turn order). A player may DOUBLE (one card then done) or, in classic
 *    mode, SPLIT a matching pair into two hands played one after the other.
 * -> once every player has finished every hand, the dealer draws and chips settle
 * -> payout -> nextRound() -> betting.
 */
export class BlackjackGame {
  private seats: Seat[] = [];
  private deck: Card[];
  private dealerHand: Card[] = [];
  private dealerModifier = 0;
  /** Extra cards the dealer is forced to take this round (Roi power). */
  private dealerExtraHits = 0;
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
      hands: [],
      inRound: false,
      modifier: 0,
      pendingPower: null,
      procUsed: false,
      specialCard: null,
      shielded: false,
      revealed: false,
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
    const actor = this.requireActor(id);
    if (!actor.ok) return actor;
    const hand = actor.hand;
    const card = this.draw();
    hand.cards.push(card);
    this.maybeProc(actor.seat, card);
    // Reaching 21+ ends this hand; the dealer waits for everyone's every hand
    this.maybeSettle();
    return OK;
  }

  stand(id: string): BlackjackActionResult {
    const actor = this.requireActor(id);
    if (!actor.ok) return actor;
    actor.hand.hasStood = true;
    this.maybeSettle();
    return OK;
  }

  /**
   * Double down: stake the hand's bet again, take exactly one card, then stop.
   * Only on a fresh two-card hand with enough chips. Works in every mode.
   */
  double(id: string): BlackjackActionResult {
    const actor = this.requireActor(id);
    if (!actor.ok) return actor;
    const { seat, hand } = actor;
    if (hand.cards.length !== 2) return fail("CANNOT_ACT");
    if (seat.chips < hand.bet) return fail("INVALID_BET");
    seat.chips -= hand.bet;
    hand.bet *= 2;
    hand.doubled = true;
    const card = this.draw();
    hand.cards.push(card);
    this.maybeProc(seat, card);
    hand.hasStood = true; // one card then done
    this.maybeSettle();
    return OK;
  }

  /**
   * Split a matching pair into two hands, staking the base bet again. Each hand
   * then draws one card. Split aces take a single card and auto-stand. Classic
   * mode only (disabled in sabotage), no re-split.
   */
  split(id: string): BlackjackActionResult {
    const actor = this.requireActor(id);
    if (!actor.ok) return actor;
    const { seat, hand } = actor;
    if (this.settings.sabotage) return fail("CANNOT_ACT");
    if (seat.hands.length !== 1 || hand !== seat.hands[0]) return fail("CANNOT_ACT");
    if (hand.cards.length !== 2) return fail("CANNOT_ACT");
    if (hand.cards[0]!.rank !== hand.cards[1]!.rank) return fail("CANNOT_ACT");
    const stake = seat.bet!;
    if (seat.chips < stake) return fail("INVALID_BET");

    seat.chips -= stake;
    const moved = hand.cards.pop()!;
    hand.fromSplit = true;
    const second: Hand = {
      cards: [moved],
      bet: stake,
      doubled: false,
      hasStood: false,
      fromSplit: true,
      result: null,
    };
    seat.hands.push(second);
    hand.cards.push(this.draw());
    second.cards.push(this.draw());
    // Split aces get a single card each, then stand.
    if (moved.rank === "A") {
      hand.hasStood = true;
      second.hasStood = true;
    }
    this.maybeSettle();
    return OK;
  }

  /**
   * Sabotage mode: a figure drawn on a hit may become special — a Valet grants
   * the ±1 modulator, an Ace grants the shield.
   */
  private maybeProc(seat: Seat, card: Card): void {
    if (!this.settings.sabotage) return;
    if (seat.procUsed || seat.pendingPower !== null) return;
    const power: BlackjackPowerKind | null =
      card.rank === "J"
        ? "modulate"
        : card.rank === "Q"
          ? "graft"
          : card.rank === "K"
            ? "force"
            : card.rank === "A"
              ? "shield"
              : null;
    if (power === null) return;
    if (this.rng() < BLACKJACK_PROC_CHANCE) {
      seat.pendingPower = power;
      seat.specialCard = card;
      seat.procUsed = true;
    }
  }

  /**
   * Spend a procced power. Real-time, instant. A Valet (modulate) reveals itself
   * on use; an Ace (shield) is applied secretly and only revealed when it later
   * blocks an attack. Doesn't end the owner's turn unless their own total hit 21+.
   */
  usePower(id: string, power: BlackjackPower): BlackjackActionResult {
    if (this.phase !== "playing") return fail("WRONG_PHASE");
    const seat = this.seats.find((s) => s.id === id);
    if (!seat) return fail("UNKNOWN_PLAYER");
    if (seat.pendingPower === null) return fail("NO_POWER");
    if (power?.kind !== seat.pendingPower) return fail("INVALID_POWER");
    if (power.kind === "modulate") {
      if (power.delta !== 1 && power.delta !== -1) return fail("INVALID_POWER");
      if (!this.applyModulate(seat.id, power.targetId, power.delta)) return fail("INVALID_TARGET");
      seat.revealed = true; // the Valet is now public (its ±1 effect shows anyway)
    } else if (power.kind === "graft") {
      const result = this.applyGraft(seat, power.targetId, power.myCardIndex, power.targetCardIndex);
      if (result === "invalid") return fail("INVALID_TARGET");
      if (result === "badCard") return fail("INVALID_POWER");
      seat.revealed = true; // the Dame is now public
    } else if (power.kind === "force") {
      // The dealer will take an extra card at showdown (capped if Kings stack).
      this.dealerExtraHits = Math.min(this.dealerExtraHits + 1, BLACKJACK_DEALER_HITS_CAP);
      seat.revealed = true; // the King is now public (the extra card shows anyway)
    } else {
      // The shield stays hidden until it blocks something.
      seat.shielded = true;
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

  /**
   * Applies a ±1 to a seat (or the dealer), clamped to the cap. A shielded seat
   * targeted by someone else blocks it (and the block reveals the shield).
   * Returns false only for an invalid target — a blocked attack still "succeeds"
   * (the attacker's power is spent).
   */
  private applyModulate(actorId: string, targetId: string, delta: number): boolean {
    if (targetId === BLACKJACK_DEALER_ID) {
      this.dealerModifier = clampModifier(this.dealerModifier + delta);
      return true;
    }
    // Any participating seat is targetable until the dealer plays — even a
    // player who has already stood or busted.
    const target = this.seats.find((s) => s.id === targetId);
    if (!target || !target.inRound) return false;
    if (target.shielded && target.id !== actorId) {
      target.revealed = true; // the shield triggers and becomes public
      return true; // attack absorbed, no modifier applied
    }
    target.modifier = clampModifier(target.modifier + delta);
    return true;
  }

  /**
   * Swaps one of the actor's cards with one of another player's (Dame). Sabotage
   * is single-hand, so both indices address the seat's only hand (hands[0]). The
   * actor's own special card can't be moved (it stays as the revealed marker). A
   * shielded target blocks it (and the block reveals the shield).
   */
  private applyGraft(
    actor: Seat,
    targetId: string,
    myCardIndex: number,
    targetCardIndex: number,
  ): "ok" | "blocked" | "invalid" | "badCard" {
    const target = this.seats.find((s) => s.id === targetId);
    if (!target || !target.inRound || target.id === actor.id) return "invalid";
    const mine = actor.hands[0];
    const theirs = target.hands[0];
    if (!mine || !theirs) return "badCard";
    if (!Number.isInteger(myCardIndex) || myCardIndex < 0 || myCardIndex >= mine.cards.length) {
      return "badCard";
    }
    if (
      !Number.isInteger(targetCardIndex) ||
      targetCardIndex < 0 ||
      targetCardIndex >= theirs.cards.length
    ) {
      return "badCard";
    }
    if (mine.cards[myCardIndex] === actor.specialCard) return "badCard";
    if (target.shielded) {
      target.revealed = true; // the shield triggers and becomes public
      return "blocked"; // attack absorbed, no swap
    }
    const card = mine.cards[myCardIndex]!;
    mine.cards[myCardIndex] = theirs.cards[targetCardIndex]!;
    theirs.cards[targetCardIndex] = card;
    return "ok";
  }

  nextRound(): BlackjackActionResult {
    if (this.phase !== "payout") return fail("WRONG_PHASE");
    this.round++;
    this.dealerHand = [];
    this.dealerModifier = 0;
    this.dealerExtraHits = 0;
    for (const seat of this.seats) {
      seat.bet = null;
      seat.hands = [];
      seat.inRound = false;
      seat.modifier = 0;
      seat.pendingPower = null;
      seat.procUsed = false;
      seat.specialCard = null;
      seat.shielded = false;
      seat.revealed = false;
    }
    this.phase = "betting";
    return OK;
  }

  /**
   * Client-facing state for one viewer. Legacy single-hand fields (`hand`,
   * `hasStood`, `result`) mirror the primary hand (hands[0]); `hands` carries
   * every hand for split rendering. Sabotage info is private: a seat's pending
   * power, special card and shield are shown to that seat's owner, and to others
   * only once revealed (a Valet on use, a shield once it blocks). Pass no viewer
   * (or "") for the fully public view used by spectators / settlement.
   */
  getView(viewerId = ""): BlackjackView {
    const hideHole = this.phase === "playing" && this.dealerHand.length > 1;
    return {
      phase: this.phase,
      round: this.round,
      players: this.seats.map((seat) => {
        const own = seat.id === viewerId;
        const showSecret = own || seat.revealed;
        const activeIndex = this.activeHandIndex(seat);
        const active = activeIndex === -1 ? undefined : seat.hands[activeIndex];
        const markCards = (cards: Card[]): BlackjackCard[] =>
          cards.map((card) =>
            showSecret && card === seat.specialCard ? { ...card, special: true } : { ...card },
          );
        const primary = seat.hands[0];
        return {
          id: seat.id,
          nickname: seat.nickname,
          chips: seat.chips,
          bet: seat.bet,
          hand: primary ? markCards(primary.cards) : [],
          hands: seat.hands.map((hand, i) => ({
            cards: markCards(hand.cards),
            bet: hand.bet,
            doubled: hand.doubled,
            hasStood: hand.hasStood,
            result: hand.result,
            active: i === activeIndex,
          })),
          inRound: seat.inRound,
          hasStood: primary?.hasStood ?? false,
          result: primary?.result ?? null,
          canAct: active !== undefined,
          canDouble:
            active !== undefined && active.cards.length === 2 && seat.chips >= active.bet,
          canSplit:
            active !== undefined &&
            !this.settings.sabotage &&
            seat.hands.length === 1 &&
            active.cards.length === 2 &&
            active.cards[0]!.rank === active.cards[1]!.rank &&
            seat.chips >= (seat.bet ?? 0),
          modifier: seat.modifier,
          // A held power is private; only the owner is prompted to spend it
          pendingPower: own ? seat.pendingPower : null,
          shielded: seat.shielded && showSecret,
        };
      }),
      dealerHand: hideHole ? this.dealerHand.slice(0, 1) : [...this.dealerHand],
      dealerHiddenCard: hideHole,
      dealerModifier: this.dealerModifier,
      settings: { ...this.settings },
    };
  }

  /** True while the hand still has a decision to make this round. */
  private canActHand(seat: Seat, hand: Hand): boolean {
    return (
      this.phase === "playing" &&
      seat.inRound &&
      !hand.hasStood &&
      handValue(hand.cards).total + seat.modifier < 21
    );
  }

  /** Index of the hand the seat is currently acting on, or -1 if none can act. */
  private activeHandIndex(seat: Seat): number {
    return seat.hands.findIndex((hand) => this.canActHand(seat, hand));
  }

  private requireActor(
    id: string,
  ): { ok: true; seat: Seat; hand: Hand } | { ok: false; error: BlackjackError } {
    if (this.phase !== "playing") return { ok: false, error: "WRONG_PHASE" };
    const seat = this.seats.find((s) => s.id === id);
    if (!seat) return { ok: false, error: "UNKNOWN_PLAYER" };
    const index = this.activeHandIndex(seat);
    if (index === -1) return { ok: false, error: "CANNOT_ACT" };
    return { ok: true, seat, hand: seat.hands[index]! };
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
    // Reshuffle the shoe before it can run out mid-round. draw() also reshuffles
    // as a fallback if it ever empties (splits/doubles draw extra cards).
    if (this.deck.length < (inRound.length + 1) * 8) {
      this.deck = shuffle(createDeck(this.settings.deckCount), this.rng);
    }
    for (const seat of inRound) {
      seat.hands = [
        {
          cards: [],
          bet: seat.bet!,
          doubled: false,
          hasStood: false,
          fromSplit: false,
          result: null,
        },
      ];
    }
    for (let pass = 0; pass < 2; pass++) {
      for (const seat of inRound) seat.hands[0]!.cards.push(this.draw());
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

  /** Once no in-round hand can still act, the dealer draws and we settle. */
  private maybeSettle(): void {
    if (this.phase !== "playing") return;
    if (this.seats.some((seat) => this.activeHandIndex(seat) !== -1)) return;
    // A procced power keeps the round open (it can still un-bust / swing a hand).
    if (this.seats.some((seat) => seat.inRound && seat.pendingPower !== null)) return;
    this.settleRound();
  }

  private settleRound(): void {
    const contenders = this.seats.some(
      (seat) => seat.inRound && seat.hands.some((hand) => !isBust(hand.cards, seat.modifier)),
    );
    if (contenders) {
      while (dealerShouldHit(this.dealerHand, this.dealerModifier)) {
        this.dealerHand.push(this.draw());
      }
      // Roi (Main forcée): after normal play, the dealer is forced to take its
      // extra card(s) — which can tip a standing dealer into a bust.
      for (let i = 0; i < this.dealerExtraHits; i++) this.dealerHand.push(this.draw());
    }
    for (const seat of this.seats) {
      if (!seat.inRound) continue;
      for (const hand of seat.hands) {
        let result = roundResult(hand.cards, this.dealerHand, seat.modifier, this.dealerModifier);
        // A 21 made across a split is an ordinary win (1:1), not a 3:2 blackjack.
        if (hand.fromSplit && result === "blackjack") result = "win";
        hand.result = result;
        seat.chips += payout(hand.bet, result);
      }
    }
    this.phase = "payout";
  }
}

/** Clamp a hand's net modifier to the allowed range. */
function clampModifier(value: number): number {
  return Math.max(-BLACKJACK_MODIFIER_CAP, Math.min(BLACKJACK_MODIFIER_CAP, value));
}
