import { describe, expect, it } from "vitest";
import {
  computeLegalActions,
  determineBlindSeats,
  determineFirstToAct,
  isBettingRoundComplete,
} from "../betting.js";
import type { PokerPlayerState } from "../state.js";

function makePlayer(
  id: string,
  seatNumber: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
  stack: number,
  committedThisRound = 0,
  actedThisRound = false,
  hasFolded = false,
  isAllIn = false
): PokerPlayerState {
  return {
    id,
    seatNumber,
    holeCards: [],
    stack,
    committedThisRound,
    committedThisHand: committedThisRound,
    hasFolded,
    isAllIn,
    actedThisRound,
  };
}

describe("Poker Betting Engine (§5.4, §5.5, §12.2)", () => {
  describe("Heads-Up Button & Blind Positioning (§5.4)", () => {
    it("in heads-up (2 players), button is Small Blind and other is Big Blind", () => {
      const p1 = makePlayer("p1", 1, 1000);
      const p2 = makePlayer("p2", 2, 1000);
      const players = [p1, p2];

      // When button is at seat 1:
      const { sbSeat, bbSeat } = determineBlindSeats(1, players);
      expect(sbSeat).toBe(1); // Button is SB
      expect(bbSeat).toBe(2); // Non-button is BB

      // Preflop: Button (SB) acts first!
      const playerMap = new Map([["p1", p1], ["p2", p2]]);
      const preflopFirst = determineFirstToAct("preflop", 1, 1, 2, playerMap);
      expect(preflopFirst).toBe("p1");

      // Postflop: Non-button (BB) acts first; Button acts last!
      const postflopFirst = determineFirstToAct("flop", 1, 1, 2, playerMap);
      expect(postflopFirst).toBe("p2");
    });
  });

  describe("3+ Players Button & Blind Positioning (§5.4)", () => {
    it("in 3+ players, SB is clockwise from button, BB is clockwise from SB", () => {
      const p1 = makePlayer("p1", 1, 1000); // Button
      const p2 = makePlayer("p2", 2, 1000); // SB
      const p3 = makePlayer("p3", 3, 1000); // BB
      const players = [p1, p2, p3];

      const { sbSeat, bbSeat } = determineBlindSeats(1, players);
      expect(sbSeat).toBe(2);
      expect(bbSeat).toBe(3);

      const playerMap = new Map([["p1", p1], ["p2", p2], ["p3", p3]]);

      // Preflop: action starts at UTG (seat after BB -> seat 1 / p1 in 3-handed)
      const preflopFirst = determineFirstToAct("preflop", 1, 2, 3, playerMap);
      expect(preflopFirst).toBe("p1");

      // Postflop: action starts at SB (seat 2 / p2)
      const postflopFirst = determineFirstToAct("flop", 1, 2, 3, playerMap);
      expect(postflopFirst).toBe("p2");
    });
  });

  describe("Legal Actions & Min-Raise Sizing (§5.5)", () => {
    it("computes free check when currentBet is 0", () => {
      const p = makePlayer("p1", 1, 500, 0);
      const legal = computeLegalActions("p1", p, 0, 50, 50);

      expect(legal.canCheck).toBe(true);
      expect(legal.canCall).toBe(false);
      expect(legal.canBet).toBe(true);
      expect(legal.minBet).toBe(50);
      expect(legal.maxBet).toBe(500);
      expect(legal.canRaise).toBe(false);
    });

    it("requires call or fold when facing a bet, and enforces min-raise", () => {
      // Facing a bet of 100
      const p = makePlayer("p1", 1, 1000, 0);
      const legal = computeLegalActions("p1", p, 100, 50, 50);

      expect(legal.canCheck).toBe(false);
      expect(legal.canCall).toBe(true);
      expect(legal.callAmount).toBe(100);

      expect(legal.canRaise).toBe(true);
      // Min raise must be at least currentBet (100) + lastFullRaiseSize (50) = 150
      expect(legal.minRaiseTo).toBe(150);
      expect(legal.maxRaiseTo).toBe(1000);
    });

    it("Big Blind has option to check or raise pre-flop if unraised", () => {
      // BB posted 50, currentBet is 50, everyone called 50
      const bb = makePlayer("bb", 2, 950, 50);
      const legal = computeLegalActions("bb", bb, 50, 50, 50);

      expect(legal.canCheck).toBe(true);
      expect(legal.canRaise).toBe(true);
      expect(legal.minRaiseTo).toBe(100); // 50 + 50
    });
  });

  describe("Incomplete All-In Rules (§5.5)", () => {
    it("short all-in player can raise all-in even if below standard min-raise", () => {
      // Current bet is 200, last raise was 100 (standard min-raise to 300)
      // Player only has 240 chips total
      const p = makePlayer("short", 1, 240, 0);
      const legal = computeLegalActions("short", p, 200, 100, 50);

      expect(legal.canRaise).toBe(true);
      // Min raise is capped at player's max all-in amount of 240
      expect(legal.minRaiseTo).toBe(240);
      expect(legal.maxRaiseTo).toBe(240);
    });

    it("POKER RULE SAFEGUARD (TDA §43): short all-in under-raise does NOT reopen betting to player who already acted", () => {
      // Player 1 originally bet 100 (actedThisRound = true, committedThisRound = 100)
      // Player 2 went all-in for 120 (a short raise of 20, less than min full raise of 100)
      // Action returns to Player 1 with currentBet = 120, lastFullRaiseSize = 100
      const p1 = makePlayer("p1", 1, 880, 100, true);
      const legal = computeLegalActions("p1", p1, 120, 100, 50);

      // Player 1 CANNOT raise!
      expect(legal.canRaise).toBe(false);
      // Player 1 can call the remaining 20 chips or fold
      expect(legal.canCall).toBe(true);
      expect(legal.callAmount).toBe(20);
      expect(legal.canFold).toBe(true);
    });
  });

  describe("Round Completion (§5.5)", () => {
    it("round is NOT complete until all players have acted", () => {
      const p1 = makePlayer("p1", 1, 950, 50, true);
      const p2 = makePlayer("p2", 2, 950, 50, false); // hasn't acted
      const map = new Map([["p1", p1], ["p2", p2]]);

      expect(isBettingRoundComplete(map, 50)).toBe(false);
    });

    it("round IS complete when all non-folded, non-all-in players have acted and matched", () => {
      const p1 = makePlayer("p1", 1, 950, 50, true);
      const p2 = makePlayer("p2", 2, 950, 50, true);
      const map = new Map([["p1", p1], ["p2", p2]]);

      expect(isBettingRoundComplete(map, 50)).toBe(true);
    });
  });
});
