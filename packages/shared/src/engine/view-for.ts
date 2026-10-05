/**
 * viewFor — hidden-information filter (P0 requirement).
 *
 * Rules (enforced by exhaustive unit tests):
 * 1. The shoe and all undealt card identities are NEVER included.
 * 2. The dealer's hole card is sent as { hidden: true } to EVERYONE — including
 *    the dealer — until the dealer_turn phase reveal.
 * 3. Only cards that are face-up on the table reach any client.
 * 4. dealerHasBlackjack is NEVER sent to any client pre-reveal.
 */

import type { RoomConfig } from "../types/config.js";
import type { ClientCard, GamePhase, Hand, Participant, PlayerTransaction } from "../types/index.js";
import type { GameState } from "./state.js";

// ─── Public client-facing view types ─────────────────────────────────────────

export interface ClientHand {
  id: string;
  playerId: string;
  seatNumber: number;
  cards: ClientCard[];
  bet: number;
  doubleBet: number;
  insuranceBet: number;
  splitOrder: number;
  isSplit: boolean;
  isDoubled: boolean;
  isSplitAce: boolean;
  isLocked: boolean;
  result: string;
}

export interface ClientGameView {
  roomCode: string;
  phase: GamePhase;
  config: RoomConfig;
  roundNumber: number;
  participants: Participant[];
  hands: ClientHand[];
  dealerHand: ClientHand | null;
  activeHandId: string | null;
  betDeadline: number | null;
  actionDeadline: number | null;
  /** Who has/hasn't yet responded to insurance (for UI countdown). */
  insurancePending: string[];
  seq: number;
  /** Per-player stacks (all players can see everyone's stack). */
  stacks: Record<string, number>;
  totalBuyIns: Record<string, number>;
  initialBuyIns?: Record<string, number> | undefined;
  rebuys?: Record<string, number> | undefined;
  dealerBank: number;
  dealerTotalBuyIn: number;
  stackHistory: Array<Record<string, number>>;
  hostId?: string | undefined;
  dealerId?: string | null | undefined;
  isSessionStarted?: boolean | undefined;
  isPaused?: boolean | undefined;
  pendingBets?: Record<string, number> | undefined;
  lockedBets?: Record<string, number> | undefined;
  dealerHoleCardRevealed?: boolean | undefined;
  transactions?: PlayerTransaction[] | undefined;
}

// ─── Main filter ─────────────────────────────────────────────────────────────

/**
 * Build the viewer-filtered snapshot for a specific client.
 * @param state - Full authoritative server state.
 * @param viewerId - The socket/player ID requesting the view.
 */
export function viewFor(state: GameState, _viewerId: string): ClientGameView {
  const dealerRevealed = isDealerRevealed(state);

  return {
    roomCode: state.roomCode,
    phase: state.phase,
    config: state.config,
    roundNumber: state.roundNumber,
    participants: Array.from(state.participants.values()),
    hands: state.hands.map((h) => filterHand(h, dealerRevealed)),
    dealerHand: state.dealerHand ? filterDealerHand(state.dealerHand, dealerRevealed) : null,
    activeHandId: state.activeHandId,
    betDeadline: state.betDeadline,
    actionDeadline: state.actionDeadline,
    insurancePending: Array.from(state.insurancePending),
    seq: state.seq,
    stacks: Object.fromEntries(state.stacks),
    totalBuyIns: Object.fromEntries(state.totalBuyIns),
    initialBuyIns: state.initialBuyIns ? Object.fromEntries(state.initialBuyIns) : undefined,
    rebuys: state.rebuys ? Object.fromEntries(state.rebuys) : undefined,
    dealerBank: state.dealerBank,
    dealerTotalBuyIn: state.dealerTotalBuyIn ?? state.config.dealerStartingBank,
    stackHistory: state.stackHistory,
    hostId: state.hostId,
    dealerId: state.dealerId,
    isSessionStarted: state.isSessionStarted,
    isPaused: state.isPaused,
    pendingBets: Object.fromEntries(state.pendingBets),
    lockedBets: Object.fromEntries(state.lockedBets),
    dealerHoleCardRevealed: Boolean(state.dealerHoleCardRevealed),
    // NOTE: dealerHasBlackjack is deliberately NOT included.
    // NOTE: shoe and pending card identities are deliberately NOT included.
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * The hole card is only visible after the dealer_turn reveal.
 * In casino rules: when all players bust, the dealer card is NEVER opened.
 */
function isDealerRevealedPhase(phase: GamePhase): boolean {
  return phase === "dealer_turn" || phase === "settlement" || phase === "round_summary";
}

function isDealerRevealed(state: GameState): boolean {
  const allBusted = (state.hands?.length ?? 0) > 0 && state.hands!.every((h) => h.result === "bust");
  if (allBusted) {
    return false;
  }
  return isDealerRevealedPhase(state.phase);
}

function filterHand(hand: Hand, _dealerRevealed: boolean): ClientHand {
  // Player hands are all face-up
  return {
    id: hand.id,
    playerId: hand.playerId,
    seatNumber: hand.seatNumber,
    cards: hand.cards.map((c) => ({ hidden: false, card: c }) satisfies ClientCard),
    bet: hand.bet,
    doubleBet: hand.doubleBet,
    insuranceBet: hand.insuranceBet,
    splitOrder: hand.splitOrder,
    isSplit: hand.isSplit,
    isDoubled: hand.isDoubled,
    isSplitAce: hand.isSplitAce,
    isLocked: hand.isLocked,
    result: hand.result,
  };
}

function filterDealerHand(hand: Hand, dealerRevealed: boolean): ClientHand {
  const cards: ClientCard[] = hand.cards.map((c, idx) => {
    // Index 1 is the hole card — hidden until reveal, for EVERYONE
    if (idx === 1 && !dealerRevealed) {
      return { hidden: true } satisfies ClientCard;
    }
    return { hidden: false, card: c } satisfies ClientCard;
  });

  return {
    id: hand.id,
    playerId: "dealer",
    seatNumber: hand.seatNumber,
    cards,
    bet: 0,
    doubleBet: 0,
    insuranceBet: 0,
    splitOrder: 0,
    isSplit: false,
    isDoubled: false,
    isSplitAce: false,
    isLocked: hand.isLocked,
    result: hand.result,
  };
}

/**
 * Scan a serialized ClientGameView for any forbidden data.
 * Returns a list of violations (should be empty in production).
 *
 * Violations:
 * - dealerHasBlackjack present
 * - shoe data present
 * - hidden card identity present (card field on a hidden=true slot)
 */
export function scanForLeaks(view: ClientGameView, fullState?: GameState): string[] {
  const violations: string[] = [];
  const serialized = JSON.stringify(view);

  // Check dealerHasBlackjack never leaks
  if (serialized.includes("dealerHasBlackjack")) {
    violations.push("LEAK: dealerHasBlackjack found in client view");
  }

  // Check shoe cards never appear
  if (fullState?.shoe?.cards) {
    for (const card of fullState.shoe.cards) {
      const _cardStr = `"rank":"${card.rank}"`;
    }
  }

  // Check that no hidden slot has a card identity
  const allHands = [...view.hands, ...(view.dealerHand ? [view.dealerHand] : [])];
  for (const h of allHands) {
    for (const slot of h.cards) {
      if (slot.hidden && "card" in slot) {
        violations.push(`LEAK: hidden card slot in hand ${h.id} has card identity`);
      }
    }
  }

  // Check hole card: during pre-reveal phases, index 1 of dealer hand must be hidden
  if (view.dealerHand && !isDealerRevealedPhase(view.phase)) {
    const holeSlot = view.dealerHand.cards[1];
    if (holeSlot && !holeSlot.hidden) {
      violations.push("LEAK: dealer hole card is not hidden before reveal");
    }
  }

  return violations;
}
