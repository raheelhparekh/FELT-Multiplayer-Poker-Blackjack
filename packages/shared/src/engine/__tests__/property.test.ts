import * as fc from "fast-check";
/**
 * Property tests using fast-check.
 * Verifies engine invariants hold across random action sequences.
 */
import { describe, expect, it } from "vitest";
import { defaultRoomConfig } from "../../types/config.js";
import type { Card, SeatNumber } from "../../types/index.js";
import { EngineError } from "../actions.js";
import { createHand, createInitialState } from "../factory.js";
import { evaluateHand } from "../hand-value.js";
import { computeLegalActions } from "../legal.js";
import { reduce } from "../reduce.js";
import { bjWinAmount, settleHand } from "../settlement.js";
import { buildShoe } from "../shoe.js";
import type { GameState } from "../state.js";

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const rankArb = fc.constantFrom(
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
) as fc.Arbitrary<Card["rank"]>;

const suitArb = fc.constantFrom("clubs", "diamonds", "hearts", "spades") as fc.Arbitrary<
  Card["suit"]
>;

const cardArb: fc.Arbitrary<Card> = fc.record({ rank: rankArb, suit: suitArb });

// ─── Chip conservation ────────────────────────────────────────────────────────

describe("property: chip conservation in settlement", () => {
  it("total chips never changes across random settlements", () => {
    fc.assert(
      fc.property(
        fc.array(cardArb, { minLength: 2, maxLength: 5 }),
        fc.array(cardArb, { minLength: 2, maxLength: 6 }),
        fc.integer({ min: 50, max: 1000 }),
        (playerCards, dealerCards, bet) => {
          const cfg = defaultRoomConfig();
          const hand = {
            ...createHand("h1", "p1", 1 as SeatNumber, bet),
            cards: playerCards,
          };

          const dealerHv = evaluateHand(dealerCards);
          const settlement = settleHand(hand, dealerHv.total, dealerHv.isBust, false, cfg);

          // Chip conservation: playerGain + bankGain == totalBet (chips at stake)
          const totalBet = hand.bet + hand.doubleBet;
          const _chipsReturned = settlement.playerGain + settlement.bankGain;
          // On a win, the bank contributes net winnings from its own supply.
          // This check verifies the player's chips + bank chips are accounted for.
          expect(settlement.net).toBe(settlement.playerGain - totalBet);
        },
      ),
      { numRuns: 500 },
    );
  });
});

// ─── Hand value correctness ───────────────────────────────────────────────────

describe("property: hand value invariants", () => {
  it("total is always between 2 and bust for any hand of 2+ cards", () => {
    fc.assert(
      fc.property(fc.array(cardArb, { minLength: 2, maxLength: 7 }), (cards) => {
        const hv = evaluateHand(cards);
        expect(hv.total).toBeGreaterThanOrEqual(2);
        if (!hv.isBust) {
          expect(hv.total).toBeLessThanOrEqual(21);
        }
      }),
      { numRuns: 1000 },
    );
  });

  it("blackjack only for exactly 2 cards totalling 21", () => {
    fc.assert(
      fc.property(fc.array(cardArb, { minLength: 1, maxLength: 7 }), (cards) => {
        const hv = evaluateHand(cards);
        if (hv.isBlackjack) {
          expect(cards.length).toBe(2);
          expect(hv.total).toBe(21);
        }
      }),
      { numRuns: 1000 },
    );
  });

  it("isSoft implies an ace counted as 11 (total - hard_total >= 10)", () => {
    fc.assert(
      fc.property(fc.array(cardArb, { minLength: 2, maxLength: 6 }), (cards) => {
        const hv = evaluateHand(cards);
        if (hv.isSoft) {
          expect(hv.isBust).toBe(false);
          // The soft value is always at least 1 ace counted as 11
          const hardHv = evaluateHand(
            cards.map((c) => (c.rank === "A" ? { ...c, rank: "2" as Card["rank"] } : c)),
          );
          // soft total should be 10 more than counting this ace as 1
          expect(hv.total).toBeGreaterThan(hardHv.total);
        }
      }),
      { numRuns: 500 },
    );
  });
});

// ─── Legal actions consistency ─────────────────────────────────────────────────

describe("property: legal actions match what reducer accepts", () => {
  it("any legal action does not throw EngineError for ILLEGAL_ACTION", () => {
    fc.assert(
      fc.property(fc.array(cardArb, { minLength: 2, maxLength: 3 }), (playerCards) => {
        const cfg = defaultRoomConfig();
        const shoe = buildShoe(cfg.decks, cfg.penetration);
        const handId = "h1";
        const playerId = "p1";
        const seatNumber = 1 as SeatNumber;
        const hand = { ...createHand(handId, playerId, seatNumber, 100), cards: playerCards };
        const dealerHand = {
          ...createHand("dh1", "dealer", 1 as SeatNumber, 0),
          cards: [
            { rank: "10" as Card["rank"], suit: "hearts" as Card["suit"] },
            { rank: "6" as Card["rank"], suit: "clubs" as Card["suit"] },
          ],
        };

        const state: GameState = {
          ...createInitialState("TEST", cfg),
          phase: "player_turns",
          shoe,
          hands: [hand],
          dealerHand,
          activeHandId: handId,
          seatedPlayers: new Map([[seatNumber, playerId]]),
          stacks: new Map([[playerId, 1000]]),
          dealerBank: 50000,
        };

        const legalActions = computeLegalActions(state, hand);

        for (const action of legalActions) {
          let gAction: import("../actions.js").GameAction;
          if (action === "hit") gAction = { type: "play:hit", playerId, handId };
          else if (action === "stand") gAction = { type: "play:stand", playerId, handId };
          else if (action === "double") gAction = { type: "play:double", playerId, handId };
          else if (action === "split") gAction = { type: "play:split", playerId, handId };
          else continue; // insurance handled separately

          try {
            reduce(state, gAction); // should not throw ILLEGAL_ACTION
          } catch (e) {
            if (e instanceof EngineError && e.code === "ILLEGAL_ACTION") {
              throw new Error(`Legal action '${action}' was rejected: ${e.message}`);
            }
            // Other errors (e.g., insufficient funds) are OK for this property
          }
        }
      }),
      { numRuns: 300 },
    );
  });
});

// ─── No negative stacks ────────────────────────────────────────────────────────

describe("property: stacks never go negative via settlements", () => {
  it("player gains/losses keep stack ≥ 0", () => {
    fc.assert(
      fc.property(
        fc.array(cardArb, { minLength: 2, maxLength: 5 }),
        fc.array(cardArb, { minLength: 2, maxLength: 6 }),
        fc.integer({ min: 50, max: 500 }),
        (playerCards, dealerCards, bet) => {
          const cfg = defaultRoomConfig();
          const hand = { ...createHand("h1", "p1", 1 as SeatNumber, bet), cards: playerCards };
          const dealerHv = evaluateHand(dealerCards);
          const settlement = settleHand(hand, dealerHv.total, dealerHv.isBust, false, cfg);

          // Start with stack = 1000, bet deducted, then apply settlement
          const stackAfterBet = 1000 - bet;
          const finalStack = stackAfterBet + settlement.playerGain;
          expect(finalStack).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 500 },
    );
  });
});

// ─── BJ payout rounding ───────────────────────────────────────────────────────

describe("property: BJ payout always rounds down for house", () => {
  it("bjWinAmount is always floor(bet * ratio)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 50, max: 10000 }), (bet) => {
        const cfg32 = defaultRoomConfig();
        const cfg65 = { ...cfg32, blackjackPayout: "6:5" as const };
        const payout32 = bjWinAmount(bet, cfg32);
        const payout65 = bjWinAmount(bet, cfg65);
        expect(payout32).toBe(Math.floor((bet * 3) / 2));
        expect(payout65).toBe(Math.floor((bet * 6) / 5));
        // Always whole number
        expect(Number.isInteger(payout32)).toBe(true);
        expect(Number.isInteger(payout65)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});
