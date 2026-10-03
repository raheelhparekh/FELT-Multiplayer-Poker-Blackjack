#!/usr/bin/env node
/**
 * 1,000,000-hand blackjack simulation using basic strategy.
 *
 * Purpose: validate the engine's house edge is plausible (~0.4–0.6% for
 * 6-deck S17 3:2 BJ). Run with: pnpm --filter @felt/tools simulate
 *
 * The simulation is a direct client of the pure engine:
 *   - One player, seat 1
 *   - Fixed bet of 100 per hand
 *   - Basic strategy decision table
 *   - No splits (for simplicity; see note below)
 *
 * Note: Full basic strategy (with splits) reduces house edge from ~0.6% to ~0.4%.
 * This script implements hard/soft totals and doubling, giving ~0.45–0.55%.
 */

import {
  type Card,
  type SeatNumber,
  buildShoe,
  defaultRoomConfig,
  drawCard,
  evaluateHand,
  shouldDealerDraw,
} from "@felt/shared";

const HANDS = 1_000_000;
const BET = 100;

const cfg = defaultRoomConfig(); // 6 decks, S17, 3:2, penetration 0.75

// ─── Basic strategy ───────────────────────────────────────────────────────────

type Action = "H" | "S" | "D" | "SP";

/**
 * Minimal basic strategy table for 6-deck S17.
 * Returns action: H=hit, S=stand, D=double (else hit), SP=split (else hit)
 */
function basicStrategy(playerCards: Card[], dealerUpRank: Card["rank"]): Action {
  const hv = evaluateHand(playerCards);
  const total = hv.total;
  const upVal = dealerUpValue(dealerUpRank);

  // Pair splitting (simplified — same value)
  if (playerCards.length === 2 && cardVal(playerCards[0]!) === cardVal(playerCards[1]!)) {
    const pairVal = cardVal(playerCards[0]!);
    if (pairVal === 11) return "SP"; // always split AA
    if (pairVal === 8) return "SP"; // always split 88
    if (pairVal === 10) return "S"; // never split TT
    if (pairVal === 5) return total >= 10 && upVal <= 9 ? "D" : "H"; // treat 55 as 10
  }

  // Soft totals
  if (hv.isSoft) {
    if (total >= 19) return "S";
    if (total === 18) {
      if (upVal <= 6) return "D";
      if (upVal <= 8) return "S";
      return "H";
    }
    if (total === 17) return upVal >= 3 && upVal <= 6 ? "D" : "H";
    if (total === 16) return upVal >= 4 && upVal <= 6 ? "D" : "H";
    if (total === 15) return upVal >= 4 && upVal <= 6 ? "D" : "H";
    if (total === 14) return upVal >= 5 && upVal <= 6 ? "D" : "H";
    if (total === 13) return upVal >= 5 && upVal <= 6 ? "D" : "H";
    return "H";
  }

  // Hard totals
  if (total >= 17) return "S";
  if (total >= 13 && total <= 16) return upVal <= 6 ? "S" : "H";
  if (total === 12) return upVal >= 4 && upVal <= 6 ? "S" : "H";
  if (total === 11) return "D";
  if (total === 10) return upVal <= 9 ? "D" : "H";
  if (total === 9) return upVal >= 3 && upVal <= 6 ? "D" : "H";
  return "H";
}

function cardVal(c: Card): number {
  if (c.rank === "A") return 11;
  if (["J", "Q", "K"].includes(c.rank)) return 10;
  return Number(c.rank);
}

function dealerUpValue(rank: Card["rank"]): number {
  if (rank === "A") return 11;
  if (["J", "Q", "K"].includes(rank)) return 10;
  return Number(rank);
}

// ─── Simulation loop ─────────────────────────────────────────────────────────

function simulate(): void {
  const startMs = Date.now();

  let totalBet = 0;
  let totalWon = 0;
  let handsPlayed = 0;
  let shoe = buildShoe(cfg.decks, cfg.penetration);
  let shuffles = 0;

  const _seat: SeatNumber = 1;

  for (let i = 0; i < HANDS; i++) {
    // Reshuffle if cut card passed
    if (shoe.cutCardPassed || shoe.cards.length < 10) {
      shoe = buildShoe(cfg.decks, cfg.penetration);
      shuffles++;
    }

    // Draw cards for player and dealer
    let c1: Card;
    let c2: Card;
    let d1: Card;
    let d2: Card;
    ({ card: c1, shoe } = drawCard(shoe));
    ({ card: d1, shoe } = drawCard(shoe)); // dealer up
    ({ card: c2, shoe } = drawCard(shoe));
    ({ card: d2, shoe } = drawCard(shoe)); // dealer hole

    const playerCards: Card[] = [c1, c2];
    const dealerCards: Card[] = [d1, d2];
    const dealerUpCard = d1;

    // Dealer peek: if dealer has BJ, settle immediately
    const dealerHv0 = evaluateHand(dealerCards);
    const playerHv0 = evaluateHand(playerCards);

    totalBet += BET;

    if (dealerHv0.isBlackjack) {
      if (playerHv0.isBlackjack) {
        // push
      } else {
        totalWon -= BET;
      }
      handsPlayed++;
      continue;
    }

    // Player blackjack (no dealer BJ)
    if (playerHv0.isBlackjack) {
      const payout = Math.floor((BET * 3) / 2);
      totalWon += payout;
      handsPlayed++;
      continue;
    }

    // Play hand with basic strategy
    let currentBet = BET;
    let doubled = false;

    while (true) {
      const action = basicStrategy(playerCards, dealerUpCard.rank);
      const hv = evaluateHand(playerCards);

      if (action === "D" && playerCards.length === 2 && !doubled) {
        // Double down
        currentBet = BET * 2;
        doubled = true;
        let card: Card;
        ({ card, shoe } = drawCard(shoe));
        playerCards.push(card);
        break; // must stand after double
      }

      if (action === "S" || hv.total >= 21) break;

      // Hit
      let card: Card;
      ({ card, shoe } = drawCard(shoe));
      playerCards.push(card);
      const newHv = evaluateHand(playerCards);
      if (newHv.isBust) break;
    }

    const finalPlayerHv = evaluateHand(playerCards);
    if (finalPlayerHv.isBust) {
      totalWon -= currentBet;
      handsPlayed++;
      continue;
    }

    // Dealer plays
    while (shouldDealerDraw(dealerCards, cfg.dealerHitsSoft17)) {
      let card: Card;
      ({ card, shoe } = drawCard(shoe));
      dealerCards.push(card);
    }

    const dealerHvFinal = evaluateHand(dealerCards);

    // Compare
    if (dealerHvFinal.isBust || finalPlayerHv.total > dealerHvFinal.total) {
      totalWon += currentBet;
    } else if (finalPlayerHv.total === dealerHvFinal.total) {
      // push
    } else {
      totalWon -= currentBet;
    }

    handsPlayed++;
  }

  const elapsedMs = Date.now() - startMs;
  const houseEdge = (-totalWon / totalBet) * 100;
  const handsPerSec = Math.round(handsPlayed / (elapsedMs / 1000));

  console.log("\n═══════════════════════════════════════════");
  console.log("  FELT Engine — House Edge Simulation");
  console.log("═══════════════════════════════════════════");
  console.log(`  Hands played:   ${handsPlayed.toLocaleString()}`);
  console.log(`  Total bet:      ${totalBet.toLocaleString()} chips`);
  console.log(`  Net won/lost:   ${totalWon.toLocaleString()} chips`);
  console.log(`  House edge:     ${houseEdge.toFixed(4)}%`);
  console.log(`  Shuffles:       ${shuffles}`);
  console.log(`  Elapsed:        ${(elapsedMs / 1000).toFixed(1)}s`);
  console.log(`  Speed:          ${handsPerSec.toLocaleString()} hands/s`);
  console.log("═══════════════════════════════════════════");

  const targetMin = 0.3;
  const targetMax = 0.7;
  if (houseEdge < targetMin || houseEdge > targetMax) {
    console.error(
      `\n⚠️  WARNING: House edge ${houseEdge.toFixed(4)}% is outside expected range ${targetMin}–${targetMax}%`,
    );
    console.error("   Investigate the engine rules or basic strategy implementation.\n");
    process.exit(1);
  } else {
    console.log(`\n✅  House edge is in the expected range (${targetMin}–${targetMax}%)\n`);
  }
}

simulate();
