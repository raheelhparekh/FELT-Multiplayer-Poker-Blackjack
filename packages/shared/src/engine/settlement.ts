import type { RoomConfig } from "../types/config.js";
import type { Hand, HandResult } from "../types/index.js";
import type { GameEvent } from "./actions.js";
import { evaluateHand } from "./hand-value.js";

// ─── Per-hand settlement ────────────────────────────────────────────────────

export interface HandSettlement {
  handId: string;
  playerId: string;
  result: HandResult;
  /** Net chips moved: positive = player gains, negative = player loses. */
  net: number;
  /** Chips returned to player stack. */
  playerGain: number;
  /** Chips moved to dealer bank. */
  bankGain: number;
}

/**
 * Settle one player hand against the dealer's final total.
 *
 * Chip movement:
 * - Win:      stack += bet × 2 (original back + winnings from bank)
 * - BJ win:   stack += bet + floor(bet × payout)
 * - Push:     stack += bet (original back)
 * - Loss/Bust: bank += bet (chips already left stack at bet:lock)
 *
 * Insurance is settled separately via settleInsurance().
 */
export function settleHand(
  hand: Hand,
  dealerTotal: number,
  dealerBust: boolean,
  dealerHasBlackjack: boolean,
  config: RoomConfig,
): HandSettlement {
  const bet = hand.bet + hand.doubleBet;
  const hv = evaluateHand(hand.cards);

  // Bust — already locked as loss during play
  if (hv.isBust) {
    return {
      handId: hand.id,
      playerId: hand.playerId,
      result: "bust",
      net: -bet,
      playerGain: 0,
      bankGain: bet,
    };
  }

  // Player blackjack
  if (hv.isBlackjack && !hand.isSplit) {
    if (dealerHasBlackjack) {
      // Push — return original bet only
      return {
        handId: hand.id,
        playerId: hand.playerId,
        result: "push",
        net: 0,
        playerGain: bet,
        bankGain: 0,
      };
    }
    const winAmount = bjWinAmount(hand.bet, config);
    return {
      handId: hand.id,
      playerId: hand.playerId,
      result: "blackjack",
      net: winAmount,
      playerGain: hand.bet + winAmount,
      bankGain: 0,
    };
  }

  // Dealer bust
  if (dealerBust) {
    return {
      handId: hand.id,
      playerId: hand.playerId,
      result: "win",
      net: bet,
      playerGain: bet * 2,
      bankGain: 0,
    };
  }

  // Compare totals
  if (hv.total > dealerTotal) {
    return {
      handId: hand.id,
      playerId: hand.playerId,
      result: "win",
      net: bet,
      playerGain: bet * 2,
      bankGain: 0,
    };
  }
  if (hv.total === dealerTotal) {
    return {
      handId: hand.id,
      playerId: hand.playerId,
      result: "push",
      net: 0,
      playerGain: bet,
      bankGain: 0,
    };
  }
  // Loss
  return {
    handId: hand.id,
    playerId: hand.playerId,
    result: "loss",
    net: -bet,
    playerGain: 0,
    bankGain: bet,
  };
}

/**
 * Settle insurance for a single hand.
 * Called after peek (regardless of player wins/losses).
 */
export function settleInsurance(
  hand: Hand,
  dealerHasBlackjack: boolean,
): { playerGain: number; bankGain: number; net: number } {
  if (hand.insuranceBet === 0) return { playerGain: 0, bankGain: 0, net: 0 };
  if (dealerHasBlackjack) {
    // Pays 2:1 — player gets stake back plus 2× winnings
    return { playerGain: hand.insuranceBet * 3, bankGain: 0, net: hand.insuranceBet * 2 };
  }
  // Insurance loses
  return { playerGain: 0, bankGain: hand.insuranceBet, net: -hand.insuranceBet };
}

/**
 * Blackjack win amount (what the bank pays — does NOT include the original bet).
 * Rounds down in favour of the house (per brief §4.1).
 */
export function bjWinAmount(bet: number, config: RoomConfig): number {
  if (config.blackjackPayout === "3:2") {
    return Math.floor((bet * 3) / 2);
  }
  return Math.floor((bet * 6) / 5);
}

/**
 * Build GameEvents for settling all hands.
 */
export function buildSettlementEvents(settlements: HandSettlement[]): GameEvent[] {
  const events: GameEvent[] = [];
  for (const s of settlements) {
    if (s.playerGain > 0) {
      events.push({ type: "chipsPaid", to: s.playerId, handId: s.handId, amount: s.playerGain });
    }
    if (s.bankGain > 0) {
      events.push({ type: "chipsSwept", from: s.playerId, handId: s.handId, amount: s.bankGain });
    }
    events.push({ type: "handResult", handId: s.handId, result: s.result, net: s.net });
  }
  return events;
}
