import { describe, expect, it } from "vitest";
import type { Card } from "../../types/domain.js";
import { buildDeck, parseCard, shuffleDeck } from "../cards.js";
import {
  compareEvaluations,
  evaluate5CardHand,
  evaluateBestHand,
  getCombinations,
} from "../evaluator.js";

const parseHand = (str: string): Card[] => str.trim().split(/\s+/).map(parseCard);

describe("Poker Hand Evaluator", () => {
  describe("Categories & Hand Recognition", () => {
    it("recognizes Royal Flush", () => {
      const cards = parseHand("As Ks Qs Js 10s");
      const ev = evaluate5CardHand(cards);
      expect(ev.category).toBe("straight-flush");
      expect(ev.tieBreakers).toEqual([14]);
      expect(ev.name).toBe("Royal Flush");
    });

    it("recognizes Straight Flush", () => {
      const cards = parseHand("9h 8h 7h 6h 5h");
      const ev = evaluate5CardHand(cards);
      expect(ev.category).toBe("straight-flush");
      expect(ev.tieBreakers).toEqual([9]);
      expect(ev.name).toBe("Straight Flush, Nine high");
    });

    it("recognizes Wheel Straight Flush (A-2-3-4-5)", () => {
      const cards = parseHand("Ad 2d 3d 4d 5d");
      const ev = evaluate5CardHand(cards);
      expect(ev.category).toBe("straight-flush");
      expect(ev.tieBreakers).toEqual([5]);
      expect(ev.name).toContain("The Wheel");
    });

    it("recognizes Four of a Kind", () => {
      const cards = parseHand("Kc Kd Kh Ks 7c");
      const ev = evaluate5CardHand(cards);
      expect(ev.category).toBe("four-of-a-kind");
      expect(ev.tieBreakers).toEqual([13, 7]);
      expect(ev.name).toContain("Four of a Kind, Kings");
    });

    it("recognizes Full House", () => {
      const cards = parseHand("Qc Qd Qh 8s 8c");
      const ev = evaluate5CardHand(cards);
      expect(ev.category).toBe("full-house");
      expect(ev.tieBreakers).toEqual([12, 8]);
      expect(ev.name).toContain("Full House, Queens full of Eights");
    });

    it("recognizes Flush", () => {
      const cards = parseHand("Kd Jd 8d 6d 2d");
      const ev = evaluate5CardHand(cards);
      expect(ev.category).toBe("flush");
      expect(ev.tieBreakers).toEqual([13, 11, 8, 6, 2]);
      expect(ev.name).toBe("Flush, King high");
    });

    it("recognizes Broadway Straight (10-J-Q-K-A)", () => {
      const cards = parseHand("Ah Kc Qs Jd 10c");
      const ev = evaluate5CardHand(cards);
      expect(ev.category).toBe("straight");
      expect(ev.tieBreakers).toEqual([14]);
      expect(ev.name).toBe("Straight, Ace high");
    });

    it("recognizes Wheel Straight (A-2-3-4-5)", () => {
      const cards = parseHand("Ac 2d 3h 4s 5c");
      const ev = evaluate5CardHand(cards);
      expect(ev.category).toBe("straight");
      expect(ev.tieBreakers).toEqual([5]);
      expect(ev.name).toContain("The Wheel");
    });

    it("does NOT recognize wrap-around straight (Q-K-A-2-3)", () => {
      const cards = parseHand("Qc Kd Ah 2s 3c");
      const ev = evaluate5CardHand(cards);
      expect(ev.category).not.toBe("straight");
      expect(ev.category).toBe("high-card");
    });

    it("recognizes Three of a Kind", () => {
      const cards = parseHand("7c 7d 7h As Kd");
      const ev = evaluate5CardHand(cards);
      expect(ev.category).toBe("three-of-a-kind");
      expect(ev.tieBreakers).toEqual([7, 14, 13]);
      expect(ev.name).toBe("Three of a Kind, Sevens");
    });

    it("recognizes Two Pair", () => {
      const cards = parseHand("Jc Jd 4h 4s Ac");
      const ev = evaluate5CardHand(cards);
      expect(ev.category).toBe("two-pair");
      expect(ev.tieBreakers).toEqual([11, 4, 14]);
      expect(ev.name).toContain("Two Pair, Jacks and Fours");
    });

    it("recognizes One Pair", () => {
      const cards = parseHand("10c 10d Kh 8s 2c");
      const ev = evaluate5CardHand(cards);
      expect(ev.category).toBe("one-pair");
      expect(ev.tieBreakers).toEqual([10, 13, 8, 2]);
      expect(ev.name).toBe("Pair of Tens");
    });

    it("recognizes High Card", () => {
      const cards = parseHand("Ac Kd 9h 7s 2c");
      const ev = evaluate5CardHand(cards);
      expect(ev.category).toBe("high-card");
      expect(ev.tieBreakers).toEqual([14, 13, 9, 7, 2]);
      expect(ev.name).toBe("Ace High");
    });
  });

  describe("Tie-Breaker Rules (§5.2)", () => {
    it("flush vs flush: breaks ties by highest different card", () => {
      const flushA = evaluate5CardHand(parseHand("Ah 10h 8h 6h 3h"));
      const flushB = evaluate5CardHand(parseHand("Ah 10h 7h 6h 3h"));
      expect(compareEvaluations(flushA, flushB)).toBeGreaterThan(0);
    });

    it("full house vs full house: trips rank takes precedence over pair rank", () => {
      // 8s full of Kings beats 7s full of Aces
      const fh8s = evaluate5CardHand(parseHand("8c 8d 8h Ks Kh"));
      const fh7s = evaluate5CardHand(parseHand("7c 7d 7h As Ah"));
      expect(compareEvaluations(fh8s, fh7s)).toBeGreaterThan(0);

      // Queens full of Deuces beats Queens full of Threes? No, trips tie, pair breaks tie:
      const fhQ3 = evaluate5CardHand(parseHand("Qc Qd Qh 3s 3h"));
      const fhQ2 = evaluate5CardHand(parseHand("Qc Qd Qh 2s 2h"));
      expect(compareEvaluations(fhQ3, fhQ2)).toBeGreaterThan(0);
    });

    it("two pair: higher pair first, then lower pair, then kicker", () => {
      const tpA_8_K = evaluate5CardHand(parseHand("Ac Ad 8h 8s Kc"));
      const tpA_8_Q = evaluate5CardHand(parseHand("Ac Ad 8h 8s Qc"));
      expect(compareEvaluations(tpA_8_K, tpA_8_Q)).toBeGreaterThan(0);

      const tpK_Q = evaluate5CardHand(parseHand("Kc Kd Qh Qs 2c"));
      const tpA_2 = evaluate5CardHand(parseHand("Ac Ad 2h 2s 3c"));
      expect(compareEvaluations(tpA_2, tpK_Q)).toBeGreaterThan(0);
    });

    it("wheel straight (5-high) loses to 6-high straight and beats high-card", () => {
      const wheel = evaluate5CardHand(parseHand("5c 4d 3h 2s Ac"));
      const sixHigh = evaluate5CardHand(parseHand("6c 5d 4h 3s 2c"));
      const aceHighStraight = evaluate5CardHand(parseHand("Ac Kd Qh Js 10c"));

      expect(compareEvaluations(wheel, sixHigh)).toBeLessThan(0);
      expect(compareEvaluations(sixHigh, aceHighStraight)).toBeLessThan(0);
    });

    it("identical five-card ranks across different suits result in a split (chop)", () => {
      const hand1 = evaluate5CardHand(parseHand("Ac Kd Qh Js 10c"));
      const hand2 = evaluate5CardHand(parseHand("As Kh Qc Jd 10s"));
      expect(compareEvaluations(hand1, hand2)).toBe(0);
    });
  });

  describe("7-Card Best Hand Evaluation", () => {
    it("selects best 5 cards out of 7 cards", () => {
      // Hole: As Ks, Board: Qs Js 10s 2c 3d -> Royal Flush
      const cards = parseHand("As Ks Qs Js 10s 2c 3d");
      const ev = evaluateBestHand(cards);
      expect(ev.name).toBe("Royal Flush");
      expect(ev.category).toBe("straight-flush");
      expect(ev.bestFiveCards).toHaveLength(5);
    });

    it("board can play (board is best five)", () => {
      // Board has Royal Flush, player has 2c 3d
      const cards = parseHand("2c 3d As Ks Qs Js 10s");
      const ev = evaluateBestHand(cards);
      expect(ev.name).toBe("Royal Flush");
    });

    it("wheel straight found with 7 cards", () => {
      const cards = parseHand("Ac 2d 3h 4s 5c Kd Qs");
      const ev = evaluateBestHand(cards);
      expect(ev.category).toBe("straight");
      expect(ev.tieBreakers[0]).toBe(5);
    });

    it("trips upgraded to full house when pair on board", () => {
      const cards = parseHand("9c 9d 9h 4s 4c 2d 7s");
      const ev = evaluateBestHand(cards);
      expect(ev.category).toBe("full-house");
      expect(ev.tieBreakers).toEqual([9, 4]);
    });
  });

  describe("Combinations & Brute-Force Verification (§12.1)", () => {
    it("getCombinations(7, 5) produces exactly 21 combinations", () => {
      const cards = parseHand("As Ks Qs Js 10s 9s 8s");
      const combos = getCombinations(cards, 5);
      expect(combos).toHaveLength(21);
    });

    it("evaluateBestHand matches brute-force search over 100 random 7-card hands", () => {
      const deck = buildDeck();
      for (let i = 0; i < 100; i++) {
        const shuffled = shuffleDeck(deck);
        const sevenCards = shuffled.slice(0, 7);

        // evaluateBestHand uses all 21 combos under the hood
        const best = evaluateBestHand(sevenCards);
        const combos = getCombinations(sevenCards, 5);
        let manualBest = evaluate5CardHand(combos[0]!);
        for (let j = 1; j < combos.length; j++) {
          const evalJ = evaluate5CardHand(combos[j]!);
          if (compareEvaluations(evalJ, manualBest) > 0) {
            manualBest = evalJ;
          }
        }

        expect(compareEvaluations(best, manualBest)).toBe(0);
        expect(best.category).toBe(manualBest.category);
      }
    });
  });

  describe("Frequency Sanity Check (§12.1)", () => {
    it("evaluates 5,000 random 7-card hands with realistic distributions", () => {
      const counts: Record<string, number> = {};
      const N = 5000;
      const deck = buildDeck();

      for (let i = 0; i < N; i++) {
        const shuffled = shuffleDeck(deck);
        const seven = shuffled.slice(0, 7);
        const ev = evaluateBestHand(seven);
        counts[ev.category] = (counts[ev.category] ?? 0) + 1;
      }

      // One pair (~43%) and two pair (~23%) should be the most common
      expect(counts["one-pair"]).toBeGreaterThan(1500);
      expect(counts["two-pair"]).toBeGreaterThan(800);
      // High card should be around ~17%
      expect(counts["high-card"]).toBeGreaterThan(500);
    });
  });
});
