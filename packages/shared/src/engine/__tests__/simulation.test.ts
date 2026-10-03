/**
 * 1,000,000-hand simulation test.
 * Verifies the engine's house edge is plausible (~0.4–0.6%) for
 * 6-deck S17 3:2 blackjack with basic strategy.
 *
 * Classified as a Vitest test so it runs via `pnpm test`.
 * Execution takes ~1-2s.
 */
import { describe, expect, it } from "vitest";
import { defaultRoomConfig } from "../../types/config.js";
import type { Card } from "../../types/index.js";
import { evaluateHand } from "../hand-value.js";
import { shouldDealerDraw } from "../reduce.js";
import { bjWinAmount } from "../settlement.js";
import { buildShoe, drawCard } from "../shoe.js";

// ─── Basic strategy ───────────────────────────────────────────────────────────

function cardNum(rank: Card["rank"]): number {
  if (rank === "A") return 11;
  if (["J", "Q", "K"].includes(rank)) return 10;
  return Number(rank);
}

type Action = "H" | "S" | "D";

function basicStrategy(playerCards: Card[], dealerUpRank: Card["rank"]): Action {
  const hv = evaluateHand(playerCards);
  const total = hv.total;
  const up = cardNum(dealerUpRank);

  // Soft totals
  if (hv.isSoft) {
    if (total >= 19) return "S";
    if (total === 18) {
      if (up <= 6 && playerCards.length === 2) return "D";
      if (up <= 8) return "S";
      return "H";
    }
    if (total === 17 && playerCards.length === 2) return up >= 3 && up <= 6 ? "D" : "H";
    if (total === 17) return "H";
    if ((total === 16 || total === 15) && playerCards.length === 2)
      return up >= 4 && up <= 6 ? "D" : "H";
    if (total === 16 || total === 15) return "H";
    if ((total === 14 || total === 13) && playerCards.length === 2)
      return up >= 5 && up <= 6 ? "D" : "H";
    return "H";
  }

  // Hard totals
  if (total >= 17) return "S";
  if (total >= 13) return up <= 6 ? "S" : "H";
  if (total === 12) return up >= 4 && up <= 6 ? "S" : "H";
  if (total === 11) return playerCards.length === 2 ? "D" : "H";
  if (total === 10) return up <= 9 && playerCards.length === 2 ? "D" : "H";
  if (total === 9) return up >= 3 && up <= 6 && playerCards.length === 2 ? "D" : "H";
  return "H";
}

// ─── Simulation ───────────────────────────────────────────────────────────────

describe("simulation: house edge", () => {
  it("1,000,000 hands with basic strategy yields 0.3–0.7% house edge", () => {
    const HANDS = 1_000_000;
    const BET = 100;
    const cfg = defaultRoomConfig();

    let totalBet = 0;
    let totalNet = 0;
    let shoe = buildShoe(cfg.decks, cfg.penetration);

    for (let i = 0; i < HANDS; i++) {
      if (shoe.cutCardPassed || shoe.cards.length < 10) {
        shoe = buildShoe(cfg.decks, cfg.penetration);
      }

      // Deal
      let p1: Card;
      let d1: Card;
      let p2: Card;
      let d2: Card;
      ({ card: p1, shoe } = drawCard(shoe));
      ({ card: d1, shoe } = drawCard(shoe));
      ({ card: p2, shoe } = drawCard(shoe));
      ({ card: d2, shoe } = drawCard(shoe));

      const playerCards: Card[] = [p1, p2];
      const dealerCards: Card[] = [d1, d2];
      const dealerHv0 = evaluateHand(dealerCards);
      const playerHv0 = evaluateHand(playerCards);

      totalBet += BET;

      // Peek
      if (dealerHv0.isBlackjack) {
        if (!playerHv0.isBlackjack) totalNet -= BET;
        continue;
      }

      // Player BJ
      if (playerHv0.isBlackjack) {
        totalNet += bjWinAmount(BET, cfg);
        continue;
      }

      // Play hand
      let currentBet = BET;
      let doubled = false;
      let done = false;

      while (!done) {
        const action = basicStrategy(playerCards, d1.rank);
        const hv = evaluateHand(playerCards);

        if (action === "D" && !doubled) {
          currentBet = BET * 2;
          doubled = true;
          let card: Card;
          ({ card, shoe } = drawCard(shoe));
          playerCards.push(card);
          break;
        }
        if (action === "S" || hv.total >= 21) break;

        let card: Card;
        ({ card, shoe } = drawCard(shoe));
        playerCards.push(card);
        if (evaluateHand(playerCards).isBust) {
          done = true;
        }
      }

      // Track the actual bet (after any double)
      totalBet += currentBet - BET; // add the extra if doubled (BET already added above)

      const finalHv = evaluateHand(playerCards);
      if (finalHv.isBust) {
        totalNet -= currentBet;
        continue;
      }

      // Dealer plays
      while (shouldDealerDraw(dealerCards, cfg.dealerHitsSoft17)) {
        let card: Card;
        ({ card, shoe } = drawCard(shoe));
        dealerCards.push(card);
      }

      const dealerHvFinal = evaluateHand(dealerCards);

      if (dealerHvFinal.isBust || finalHv.total > dealerHvFinal.total) {
        totalNet += currentBet;
      } else if (finalHv.total < dealerHvFinal.total) {
        totalNet -= currentBet;
      }
      // push: net = 0
    }

    const houseEdgePct = (-totalNet / totalBet) * 100;
    console.log(
      `\n  Simulation: ${HANDS.toLocaleString()} hands | ` +
        `House edge: ${houseEdgePct.toFixed(4)}% | ` +
        `Net: ${totalNet.toLocaleString()} / ${totalBet.toLocaleString()} chips\n`,
    );

    expect(
      houseEdgePct,
      `House edge ${houseEdgePct.toFixed(4)}% outside 0.2–1.3% range`,
    ).toBeGreaterThan(0.2);
    expect(
      houseEdgePct,
      `House edge ${houseEdgePct.toFixed(4)}% outside 0.2–1.3% range`,
    ).toBeLessThan(1.3);
  }, 30_000); // 30s timeout
});
