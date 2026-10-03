import type { RoomConfig } from "../types/config.js";
import type { Card, Hand, LegalAction } from "../types/index.js";
import { evaluateHand } from "./hand-value.js";
import { canSplitByRank, canSplitByValue } from "./hand-value.js";
import type { GameState } from "./state.js";

/**
 * Compute which actions are legal for a given hand.
 * Used by the reducer to validate incoming actions and by the UI to show/hide buttons.
 */
export function computeLegalActions(state: GameState, hand: Hand): LegalAction[] {
  if (hand.isLocked || state.phase !== "player_turns") return [];
  if (state.activeHandId !== hand.id) return [];

  const hv = evaluateHand(hand.cards);
  const { config } = state;

  // Split-ace rule: no further actions (already has exactly one more card)
  if (hand.isSplitAce) return ["stand"];

  const actions: LegalAction[] = [];

  // Always can stand (unless bust — but bust = locked, so won't reach here)
  actions.push("stand");

  // Hit: always allowed unless at 21 (which would be locked)
  if (hv.total < 21) {
    actions.push("hit");
  }

  // Double down
  if (canDouble(hand, config, state)) {
    actions.push("double");
  }

  // Split
  if (canSplit(hand, config, state)) {
    actions.push("split");
  }

  return actions;
}

function canDouble(hand: Hand, config: RoomConfig, state: GameState): boolean {
  // Only on exactly 2 cards
  if (hand.cards.length !== 2) return false;
  // Cannot double on a split ace hand
  if (hand.isSplitAce) return false;
  // Cannot double after split if config disallows
  if (hand.isSplit && !config.doubleAfterSplit) return false;

  const hv = evaluateHand(hand.cards);

  // Restriction: only totals 9-11
  if (config.doubleRestriction === "9-11") {
    if (hv.total < 9 || hv.total > 11) return false;
  }

  // Player must be able to afford the extra bet
  const playerStack = state.stacks.get(hand.playerId) ?? 0;
  if (playerStack < hand.bet) return false;

  // Bank liability check
  const additionalLiability = hand.bet; // doubling at most pays 1× extra
  if (!bankCanCover(state, additionalLiability)) return false;

  return true;
}

function canSplit(hand: Hand, config: RoomConfig, state: GameState): boolean {
  // Only on exactly 2 cards
  if (hand.cards.length !== 2) return false;

  // Cannot exceed max split hands per player
  if (hand.splitDepth >= config.maxSplitHands - 1) return false;

  // Cannot resplit aces if config disallows
  if (hand.isSplitAce && !config.resplitAces) return false;

  const [a, b] = hand.cards as [Card, Card];

  // Value vs rank split
  const splitOk = config.splitBy === "value" ? canSplitByValue(a, b) : canSplitByRank(a, b);
  if (!splitOk) return false;

  // Player must be able to afford another equal bet
  const playerStack = state.stacks.get(hand.playerId) ?? 0;
  if (playerStack < hand.bet) return false;

  // Bank liability: new hand pays at most 1:1 (split 21 is not BJ)
  if (!bankCanCover(state, hand.bet)) return false;

  return true;
}

/**
 * Check whether the dealer bank can absorb `additionalLiability` more chips.
 * Does NOT mutate state.
 */
export function bankCanCover(state: GameState, additionalLiability: number): boolean {
  return totalLiability(state) + additionalLiability <= state.dealerBank;
}

/**
 * Total maximum payout the bank may owe across all open hands (including
 * hands that are already in play from earlier splits/doubles this round).
 */
export function totalLiability(state: GameState): number {
  const { config } = state;
  let liability = 0;
  for (const hand of state.hands) {
    if (hand.result !== "pending") continue; // already settled
    const bet = hand.bet + hand.doubleBet;
    const bjMultiplier = config.blackjackPayout === "3:2" ? 1.5 : 1.2;
    // Split hands: 21 pays 1:1, not BJ
    const maxPayout = hand.isSplit ? bet : Math.floor(bet * bjMultiplier);
    liability += Math.max(maxPayout, bet);
    liability += hand.insuranceBet * 2;
  }
  return liability;
}
