import { describe, expect, it } from "vitest";

import { compareHands, evaluateHand } from "./evaluate";
import type { Card, Rank, Suit } from "../../deck";

const c = (rank: Rank, suit: Suit = "spades"): Card => ({ rank, suit });

describe("evaluateHand categories", () => {
  it("high card", () => {
    const score = evaluateHand([c("A"), c("K", "hearts"), c("9", "clubs"), c("7", "hearts"), c("2", "diamonds")]);
    expect(score.categoryName).toBe("high-card");
    expect(score.tiebreak).toEqual([14, 13, 9, 7, 2]);
  });

  it("pair with kickers", () => {
    const score = evaluateHand([c("Q"), c("Q", "hearts"), c("A", "clubs"), c("9", "hearts"), c("2", "diamonds")]);
    expect(score.categoryName).toBe("pair");
    expect(score.tiebreak).toEqual([12, 14, 9, 2]);
  });

  it("two pair keeps the best two of three pairs", () => {
    const score = evaluateHand([
      c("Q"), c("Q", "hearts"),
      c("9", "clubs"), c("9", "hearts"),
      c("2", "diamonds"), c("2", "clubs"),
      c("A", "diamonds"),
    ]);
    expect(score.categoryName).toBe("two-pair");
    expect(score.tiebreak).toEqual([12, 9, 14]);
  });

  it("three of a kind", () => {
    const score = evaluateHand([c("7"), c("7", "hearts"), c("7", "clubs"), c("K", "hearts"), c("2", "diamonds")]);
    expect(score.categoryName).toBe("three-of-a-kind");
    expect(score.tiebreak).toEqual([7, 13, 2]);
  });

  it("straight, including broadway and the wheel", () => {
    expect(
      evaluateHand([c("10"), c("J", "hearts"), c("Q", "clubs"), c("K", "hearts"), c("A", "diamonds")]).categoryName,
    ).toBe("straight");
    const wheel = evaluateHand([c("A"), c("2", "hearts"), c("3", "clubs"), c("4", "hearts"), c("5", "diamonds")]);
    expect(wheel.categoryName).toBe("straight");
    expect(wheel.tiebreak).toEqual([5]); // five-high
  });

  it("flush", () => {
    const score = evaluateHand([c("A"), c("J"), c("9"), c("6"), c("3"), c("K", "hearts"), c("Q", "hearts")]);
    expect(score.categoryName).toBe("flush");
    expect(score.tiebreak).toEqual([14, 11, 9, 6, 3]);
  });

  it("full house, preferring the higher trips when there are two", () => {
    const score = evaluateHand([
      c("9"), c("9", "hearts"), c("9", "clubs"),
      c("4", "diamonds"), c("4", "clubs"), c("4", "hearts"),
      c("A", "diamonds"),
    ]);
    expect(score.categoryName).toBe("full-house");
    expect(score.tiebreak).toEqual([9, 4]);
  });

  it("four of a kind with kicker", () => {
    const score = evaluateHand([
      c("8"), c("8", "hearts"), c("8", "clubs"), c("8", "diamonds"),
      c("K", "hearts"), c("2", "clubs"),
    ]);
    expect(score.categoryName).toBe("four-of-a-kind");
    expect(score.tiebreak).toEqual([8, 13]);
  });

  it("straight flush beats the same cards read as flush or straight", () => {
    const score = evaluateHand([c("9"), c("8"), c("7"), c("6"), c("5"), c("A", "hearts"), c("A", "diamonds")]);
    expect(score.categoryName).toBe("straight-flush");
    expect(score.tiebreak).toEqual([9]);
  });

  it("picks the best five out of seven", () => {
    // Pair of aces should pick K, Q, J kickers from seven cards
    const score = evaluateHand([
      c("A"), c("A", "hearts"),
      c("K", "clubs"), c("Q", "hearts"), c("J", "diamonds"), c("4", "clubs"), c("2", "hearts"),
    ]);
    expect(score.tiebreak).toEqual([14, 13, 12, 11]);
  });
});

describe("compareHands", () => {
  it("compares categories then kickers", () => {
    const flush = evaluateHand([c("A"), c("J"), c("9"), c("6"), c("3")]);
    const straight = evaluateHand([c("10"), c("J", "hearts"), c("Q", "clubs"), c("K", "hearts"), c("A", "diamonds")]);
    expect(compareHands(flush, straight)).toBeGreaterThan(0);

    const pairAceKing = evaluateHand([c("Q"), c("Q", "hearts"), c("A", "clubs"), c("K", "hearts"), c("2", "diamonds")]);
    const pairAceJack = evaluateHand([c("Q", "clubs"), c("Q", "diamonds"), c("A", "hearts"), c("J", "hearts"), c("2", "clubs")]);
    expect(compareHands(pairAceKing, pairAceJack)).toBeGreaterThan(0);
  });

  it("detects exact ties", () => {
    const a = evaluateHand([c("9"), c("8"), c("7"), c("6"), c("5")]);
    const b = evaluateHand([c("9", "hearts"), c("8", "hearts"), c("7", "hearts"), c("6", "hearts"), c("5", "hearts")]);
    expect(compareHands(a, b)).toBe(0);
  });
});
