import { describe, expect, it } from "vitest";
import { parseCard } from "../cards.js";
import { calculateSidePots, resolvePots, type Contributor } from "../side-pots.js";
import type { PokerPlayerState, Pot } from "../state.js";

describe("Poker Side Pots Engine (§5.6, §12.3)", () => {
  it("calculates tiered side pots correctly from §5.6 worked example", () => {
    // P1 all-in 100, P2 all-in 250, P3 calls 250, P4 calls 250
    const contributors: Contributor[] = [
      { playerId: "p1", totalCommitted: 100, hasFolded: false, isAllIn: true, seatNumber: 1 },
      { playerId: "p2", totalCommitted: 250, hasFolded: false, isAllIn: true, seatNumber: 2 },
      { playerId: "p3", totalCommitted: 250, hasFolded: false, isAllIn: false, seatNumber: 3 },
      { playerId: "p4", totalCommitted: 250, hasFolded: false, isAllIn: false, seatNumber: 4 },
    ];

    const pots = calculateSidePots(contributors);
    expect(pots).toHaveLength(2);

    // Level 1 (0 to 100): 4 * 100 = 400. Eligible: p1, p2, p3, p4
    expect(pots[0]!.amount).toBe(400);
    expect(pots[0]!.eligiblePlayerIds).toEqual(["p1", "p2", "p3", "p4"]);

    // Level 2 (100 to 250): 3 * 150 = 450. Eligible: p2, p3, p4
    expect(pots[1]!.amount).toBe(450);
    expect(pots[1]!.eligiblePlayerIds).toEqual(["p2", "p3", "p4"]);

    // Total pot sum = 850
    expect(pots[0]!.amount + pots[1]!.amount).toBe(850);
  });

  it("folded player chips are included in the pots but player is not eligible to win", () => {
    // P1 all-in 100, P2 bet 200 and folded, P3 all-in 300, P4 calls 300
    const contributors: Contributor[] = [
      { playerId: "p1", totalCommitted: 100, hasFolded: false, isAllIn: true, seatNumber: 1 },
      { playerId: "p2", totalCommitted: 200, hasFolded: true, isAllIn: false, seatNumber: 2 },
      { playerId: "p3", totalCommitted: 300, hasFolded: false, isAllIn: true, seatNumber: 3 },
      { playerId: "p4", totalCommitted: 300, hasFolded: false, isAllIn: false, seatNumber: 4 },
    ];

    const pots = calculateSidePots(contributors);
    // Tier 1 (0..100): p1(100) + p2(100) + p3(100) + p4(100) = 400. Eligible: p1, p3, p4 (p2 folded)
    expect(pots[0]!.amount).toBe(400);
    expect(pots[0]!.eligiblePlayerIds).toEqual(["p1", "p3", "p4"]);

    // Tier 2 (100..300): p2(100) + p3(200) + p4(200) = 500. Eligible: p3, p4
    expect(pots[1]!.amount).toBe(500);
    expect(pots[1]!.eligiblePlayerIds).toEqual(["p3", "p4"]);

    // Total chips = 100 + 200 + 300 + 300 = 900
    expect(pots[0]!.amount + pots[1]!.amount).toBe(900);
  });

  it("awards main pot to best hand and side pot to second best hand when main pot winner has no claim", () => {
    // P1 has Royal Flush (best), but was only in Main Pot (400 chips)
    // P2 has Pair of Kings, P3 has Pair of Aces (beats P2, wins Side Pot)
    const pots: Pot[] = [
      { amount: 400, eligiblePlayerIds: ["p1", "p2", "p3"] },
      { amount: 500, eligiblePlayerIds: ["p2", "p3"] },
    ];

    const community = ["10s", "Js", "Qs", "2d", "3c"].map(parseCard);
    const players = new Map<string, PokerPlayerState>([
      [
        "p1",
        {
          id: "p1",
          seatNumber: 1,
          holeCards: ["As", "Ks"].map(parseCard),
          stack: 0,
          committedThisRound: 0,
          committedThisHand: 100,
          hasFolded: false,
          isAllIn: true,
          actedThisRound: true,
        },
      ],
      [
        "p2",
        {
          id: "p2",
          seatNumber: 2,
          holeCards: ["Kh", "Kd"].map(parseCard),
          stack: 0,
          committedThisRound: 0,
          committedThisHand: 300,
          hasFolded: false,
          isAllIn: true,
          actedThisRound: true,
        },
      ],
      [
        "p3",
        {
          id: "p3",
          seatNumber: 3,
          holeCards: ["Ah", "Ad"].map(parseCard),
          stack: 0,
          committedThisRound: 0,
          committedThisHand: 300,
          hasFolded: false,
          isAllIn: true,
          actedThisRound: true,
        },
      ],
    ]);

    const winners = resolvePots(pots, players, community, 1, 25);
    expect(winners).toHaveLength(2);

    // Pot 0: P1 wins 400 with Royal Flush
    const p1Win = winners.find((w) => w.potIndex === 0);
    expect(p1Win!.playerId).toBe("p1");
    expect(p1Win!.amount).toBe(400);
    expect(p1Win!.handName).toBe("Royal Flush");

    // Pot 1: P3 wins 500 with Pair of Aces (P1 is not eligible)
    const p3Win = winners.find((w) => w.potIndex === 1);
    expect(p3Win!.playerId).toBe("p3");
    expect(p3Win!.amount).toBe(500);
    expect(p3Win!.handName).toBe("Pair of Aces");
  });

  it("distributes odd chips clockwise from the button position on split pot", () => {
    // Pot of 75 chips split between 2 players (p2 and p3).
    // Base share = 25 each, remainder = 25.
    // Button is at seat 1.
    // Clockwise from button: seat 2 (p2) is closest, so seat 2 gets the extra 25 chip!
    const pots: Pot[] = [{ amount: 75, eligiblePlayerIds: ["p2", "p3"] }];
    const community = ["10s", "Jd", "Qc", "2s", "3h"].map(parseCard);
    const players = new Map<string, PokerPlayerState>([
      [
        "p2",
        {
          id: "p2",
          seatNumber: 2,
          holeCards: ["Ah", "Kd"].map(parseCard),
          stack: 0,
          committedThisRound: 0,
          committedThisHand: 37,
          hasFolded: false,
          isAllIn: false,
          actedThisRound: true,
        },
      ],
      [
        "p3",
        {
          id: "p3",
          seatNumber: 3,
          holeCards: ["As", "Kc"].map(parseCard),
          stack: 0,
          committedThisRound: 0,
          committedThisHand: 38,
          hasFolded: false,
          isAllIn: false,
          actedThisRound: true,
        },
      ],
    ]);

    const winners = resolvePots(pots, players, community, 1, 25);
    expect(winners).toHaveLength(2);

    const winP2 = winners.find((w) => w.playerId === "p2")!;
    const winP3 = winners.find((w) => w.playerId === "p3")!;

    // P2 is seat 2 (first clockwise from button seat 1), so receives 50
    // P3 receives 25
    expect(winP2.amount).toBe(50);
    expect(winP3.amount).toBe(25);
  });
});
