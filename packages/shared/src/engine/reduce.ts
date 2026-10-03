/**
 * Pure game engine reducer.
 *
 * reduce(state, action) → { state, events }
 *
 * Rules:
 * - No timers, no I/O, no Math.random.
 * - Shoe randomness was committed at buildShoe() time; drawing is deterministic.
 * - Throws EngineError for illegal actions (server must catch and return coded error).
 * - State is treated as immutable — always return a new state object.
 */

import type { RoomConfig } from "../types/config.js";
import { RoomConfigSchema } from "../types/config.js";
import type { Card, Hand, SeatNumber } from "../types/index.js";
import type { GameAction, GameEvent, ReducerResult } from "./actions.js";
import { EngineError } from "./actions.js";
import { createHand, nextHandId } from "./factory.js";
import { evaluateHand } from "./hand-value.js";
import { bankCanCover, computeLegalActions } from "./legal.js";
import { bjWinAmount, buildSettlementEvents, settleHand } from "./settlement.js";
import { buildShoe, drawCard } from "./shoe.js";
import type { GameState } from "./state.js";

// ─── Main dispatcher ─────────────────────────────────────────────────────────

export function reduce(state: GameState, action: GameAction): ReducerResult {
  switch (action.type) {
    case "host:startSession":
      return reduceStartSession(state);

    case "bet:add":
      return reduceBetAdd(state, action.playerId, action.amount);
    case "bet:undo":
      return reduceBetUndo(state, action.playerId);
    case "bet:clear":
      return reduceBetClear(state, action.playerId);
    case "bet:repeat":
      return reduceBetRepeat(state, action.playerId);
    case "bet:lock":
      return reduceBetLock(state, action.playerId);
    case "bet:sitOut":
      return reduceBetSitOut(state, action.playerId);

    case "dealer:deal":
      return reduceDeal(state);
    case "dealer:reveal":
      return reduceDealerReveal(state);
    case "dealer:draw":
      return reduceDealerDraw(state);
    case "dealer:nextRound":
      return reduceNextRound(state);
    case "dealer:shuffle":
      return reduceShuffle(state);

    case "play:hit":
      return reduceHit(state, action.playerId, action.handId);
    case "play:stand":
      return reduceStand(state, action.playerId, action.handId);
    case "play:double":
      return reduceDouble(state, action.playerId, action.handId);
    case "play:split":
      return reduceSplit(state, action.playerId, action.handId);
    case "play:insurance":
      return reduceInsurance(state, action.playerId, action.handId, action.accept);

    case "host:adjustChips":
      return reduceAdjustChips(state, action.target, action.op, action.amount);
    case "host:updateConfig":
      return reduceUpdateConfig(state, action.config);

    case "rebuy:request":
      return reduceRebuy(state, action.playerId);

    default: {
      const _exhaustive: never = action;
      throw new EngineError("ILLEGAL_ACTION", `Unknown action: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

// ─── Session ─────────────────────────────────────────────────────────────────

function reduceStartSession(state: GameState): ReducerResult {
  assertPhase(state, "lobby");
  return ok({ ...state, phase: "betting", isSessionStarted: true, roundNumber: 1 }, [
    { type: "sessionStarted" },
    { type: "roundStarted", roundNumber: 1 },
  ]);
}

// ─── Betting ─────────────────────────────────────────────────────────────────

function reduceBetAdd(state: GameState, playerId: string, amount: number): ReducerResult {
  assertPhase(state, "betting");
  assertSeated(state, playerId);

  const current = state.pendingBets.get(playerId) ?? 0;
  const newTotal = current + amount;
  const stack = state.stacks.get(playerId) ?? 0;

  if (newTotal > state.config.maxBet) {
    throw new EngineError("BET_TOO_HIGH", `Bet exceeds maxBet (${state.config.maxBet})`);
  }
  if (amount > stack - current) {
    throw new EngineError("INSUFFICIENT_FUNDS", "Not enough chips");
  }
  // Not a valid denomination? We allow any multiple in the engine; UI enforces denominations.

  const pendingBets = new Map(state.pendingBets);
  pendingBets.set(playerId, newTotal);
  return ok({ ...state, pendingBets }, []);
}

function reduceBetUndo(state: GameState, playerId: string): ReducerResult {
  assertPhase(state, "betting");
  const pendingBets = new Map(state.pendingBets);
  pendingBets.set(playerId, 0);
  return ok({ ...state, pendingBets }, []);
}

function reduceBetClear(state: GameState, playerId: string): ReducerResult {
  assertPhase(state, "betting");
  const pendingBets = new Map(state.pendingBets);
  pendingBets.delete(playerId);
  return ok({ ...state, pendingBets }, []);
}

function reduceBetRepeat(state: GameState, playerId: string): ReducerResult {
  assertPhase(state, "betting");
  const lastBet = state.lastBets.get(playerId) ?? 0;
  if (lastBet === 0) return ok(state, []);

  const stack = state.stacks.get(playerId) ?? 0;
  const amount = Math.min(lastBet, stack, state.config.maxBet);
  const pendingBets = new Map(state.pendingBets);
  pendingBets.set(playerId, amount);
  return ok({ ...state, pendingBets }, []);
}

function reduceBetLock(state: GameState, playerId: string): ReducerResult {
  assertPhase(state, "betting");
  assertSeated(state, playerId);

  const bet = state.pendingBets.get(playerId) ?? 0;
  if (bet < state.config.minBet) {
    throw new EngineError("BET_TOO_LOW", `Minimum bet is ${state.config.minBet}`);
  }

  // Bank liability check: can the bank cover a BJ payout on this bet?
  const bjPayout = bjWinAmount(bet, state.config);
  if (!bankCanCover(state, bjPayout)) {
    throw new EngineError("BANK_CANNOT_COVER", "Bank can't cover this bet");
  }

  const stack = state.stacks.get(playerId) ?? 0;
  if (stack < bet) {
    throw new EngineError("INSUFFICIENT_FUNDS", "Not enough chips");
  }

  const pendingBets = new Map(state.pendingBets);
  pendingBets.delete(playerId);

  const lockedBets = new Map(state.lockedBets);
  lockedBets.set(playerId, bet);

  const lastBets = new Map(state.lastBets);
  lastBets.set(playerId, bet);

  const stacks = new Map(state.stacks);
  stacks.set(playerId, stack - bet);

  return ok({ ...state, pendingBets, lockedBets, lastBets, stacks }, [
    { type: "chipsBet", playerId, handId: "", amount: bet },
  ]);
}

function reduceBetSitOut(state: GameState, playerId: string): ReducerResult {
  assertPhase(state, "betting");
  const sittingOut = new Set(state.sittingOut);
  sittingOut.add(playerId);
  const pendingBets = new Map(state.pendingBets);
  pendingBets.delete(playerId);
  return ok({ ...state, sittingOut, pendingBets }, []);
}

// ─── Dealing ─────────────────────────────────────────────────────────────────

function reduceDeal(state: GameState): ReducerResult {
  assertPhase(state, "betting");
  if (state.lockedBets.size === 0) {
    throw new EngineError("ILLEGAL_ACTION", "No bets are locked");
  }
  if (state.dealerBank < state.config.minBet) {
    throw new EngineError("BANK_CANNOT_COVER", "Bank below minimum bet — top up before dealing");
  }

  const events: GameEvent[] = [];
  let s = state;

  // Determine play order: sorted seats of players who locked bets
  const activePlayers = sortedSeatedPlayers(state).filter(([, pid]) => state.lockedBets.has(pid));

  // Create player hands
  const hands: Hand[] = [];
  for (const [seat, playerId] of activePlayers) {
    const bet = state.lockedBets.get(playerId)!;
    const { id, state: s2 } = nextHandId(s);
    s = s2;
    hands.push(createHand(id, playerId, seat, bet));
  }

  // Create dealer hand
  const { id: dealerHandId, state: s3 } = nextHandId(s);
  s = s3;
  const dealerHand: Hand = createHand(dealerHandId, "dealer", 1 as SeatNumber, 0);

  // Dealing sequence: p1c1, p2c1... dealer_up, p1c2, p2c2... dealer_hole
  const dealingOrder = [
    ...hands.map((h, i) => ({ hand: h, isDealer: false, round: 0, idx: i })),
    { hand: dealerHand, isDealer: true, round: 0, idx: hands.length },
    ...hands.map((h, i) => ({ hand: h, isDealer: false, round: 1, idx: i })),
    { hand: dealerHand, isDealer: true, round: 1, idx: hands.length + 1 },
  ];

  const allHands = [...hands, dealerHand];
  // Build a mutable map for fast update
  const handMap = new Map(allHands.map((h) => [h.id, { ...h, cards: [...h.cards] }]));

  let shoe = s.shoe;

  for (const { hand, isDealer, round } of dealingOrder) {
    const isHoleCard = isDealer && round === 1;
    const { card, shoe: newShoe } = drawCard(shoe);
    shoe = newShoe;

    const h = handMap.get(hand.id)!;
    h.cards.push(card);
    handMap.set(hand.id, h);

    events.push({
      type: "cardDealt",
      to: isDealer ? "dealer" : hand.playerId,
      handId: hand.id,
      card: isHoleCard ? null : card, // hole card is hidden in events
    });
  }

  // Resolve hands from map
  const finalHands = hands.map((h) => handMap.get(h.id)!);
  const finalDealerHand = handMap.get(dealerHand.id)!;

  s = { ...s, shoe, hands: finalHands, dealerHand: finalDealerHand, phase: "dealing" };

  // Auto-lock player hands that are blackjack
  const { state: s4, events: bjEvents } = autoLockBlackjacks(s);
  s = s4;
  events.push(...bjEvents);

  // Dealer's up-card (first card)
  const upCard = finalDealerHand.cards[0]!;
  const upCardValue = cardValue(upCard);

  // Insurance offered?
  if (upCard.rank === "A" && state.config.insuranceEnabled && finalHands.length > 0) {
    const insurancePending = new Set(finalHands.map((h) => h.playerId));
    for (const h of finalHands) {
      events.push({ type: "insuranceOffered", handId: h.id });
    }
    return ok({ ...s, phase: "insurance", insurancePending }, events);
  }

  // Peek (server-side only): A or 10-value up card
  if (upCard.rank === "A" || upCardValue === 10) {
    const { state: s5, events: peekEvents } = performPeek(s, events);
    return ok(s5, peekEvents);
  }

  // No peek needed — straight to player turns
  return ok(advanceToPlayerTurns(s), events);
}

// ─── Insurance ───────────────────────────────────────────────────────────────

function reduceInsurance(
  state: GameState,
  playerId: string,
  _handId: string,
  accept: boolean,
): ReducerResult {
  assertPhase(state, "insurance");

  if (!state.insurancePending.has(playerId)) {
    throw new EngineError("ILLEGAL_ACTION", "Player not eligible for insurance");
  }

  let s = state;
  const events: GameEvent[] = [];

  if (accept) {
    // Find the player's hand(s)
    const playerHands = s.hands.filter((h) => h.playerId === playerId);
    const stacks = new Map(s.stacks);
    const updatedHands = [...s.hands];

    for (const hand of playerHands) {
      const maxInsurance = Math.floor(hand.bet / 2);
      const playerStack = stacks.get(playerId) ?? 0;
      const insuranceBet = Math.min(maxInsurance, playerStack);
      if (insuranceBet <= 0) continue;

      stacks.set(playerId, playerStack - insuranceBet);

      const idx = updatedHands.findIndex((h) => h.id === hand.id);
      updatedHands[idx] = { ...hand, insuranceBet };
    }
    s = { ...s, stacks, hands: updatedHands };
  }

  const insuranceDecisions = new Map(s.insuranceDecisions);
  insuranceDecisions.set(playerId, accept);

  const insurancePending = new Set(s.insurancePending);
  insurancePending.delete(playerId);

  s = { ...s, insuranceDecisions, insurancePending };

  // If all players have decided, perform peek
  if (insurancePending.size === 0) {
    const { state: s2, events: peekEvents } = performPeek(s, events);
    return ok(s2, peekEvents);
  }

  return ok(s, events);
}

// ─── Peek (server-side only) ─────────────────────────────────────────────────

function performPeek(state: GameState, existingEvents: GameEvent[]): ReducerResult {
  const events = [...existingEvents];
  const dealerHand = state.dealerHand;
  if (!dealerHand) throw new EngineError("ILLEGAL_ACTION", "No dealer hand for peek");
  const dealerHasBlackjack = isBlackjackHand(dealerHand.cards);
  let s = { ...state, dealerHasBlackjack, phase: "peek" as const };

  events.push({ type: "insuranceResolved", dealerHasBlackjack });

  if (dealerHasBlackjack) {
    // Settle insurance + all player hands
    const { state: settled, events: settleEvents } = settleAllAfterDealerBJ(s);
    events.push(...settleEvents);
    return ok(settled, events);
  }

  // Insurance bets lost (no dealer BJ)
  const stacks = new Map(s.stacks);
  let dealerBank = s.dealerBank;
  const updatedHands = s.hands.map((h) => {
    if (h.insuranceBet > 0) {
      stacks.set(h.playerId, stacks.get(h.playerId) ?? 0); // already deducted at lock
      dealerBank += h.insuranceBet;
      events.push({ type: "chipsSwept", from: h.playerId, handId: h.id, amount: h.insuranceBet });
    }
    return h;
  });

  s = { ...s, stacks, dealerBank, hands: updatedHands };
  return ok(advanceToPlayerTurns(s), events);
}

function settleAllAfterDealerBJ(state: GameState): ReducerResult {
  const events: GameEvent[] = [];
  const stacks = new Map(state.stacks);
  let dealerBank = state.dealerBank;
  const updatedHands: Hand[] = [];

  for (const hand of state.hands) {
    const hv = evaluateHand(hand.cards);
    const isPlayerBJ = hv.isBlackjack && !hand.isSplit;

    // Insurance settlement
    if (hand.insuranceBet > 0) {
      // Dealer has BJ → insurance pays 2:1
      const payout = hand.insuranceBet * 3; // stake back + 2× winnings
      stacks.set(hand.playerId, (stacks.get(hand.playerId) ?? 0) + payout);
      dealerBank -= hand.insuranceBet * 2; // bank pays 2× winnings
      events.push({ type: "chipsPaid", to: hand.playerId, handId: hand.id, amount: payout });
    }

    let result: Hand["result"];
    if (isPlayerBJ) {
      // Push — return original bet
      const bet = hand.bet + hand.doubleBet;
      stacks.set(hand.playerId, (stacks.get(hand.playerId) ?? 0) + bet);
      events.push({ type: "chipsPaid", to: hand.playerId, handId: hand.id, amount: bet });
      result = "push";
    } else {
      // Loss — chips already left stack at bet:lock; go to bank
      dealerBank += hand.bet + hand.doubleBet;
      events.push({ type: "chipsSwept", from: hand.playerId, handId: hand.id, amount: hand.bet });
      result = "loss";
    }
    events.push({ type: "handResult", handId: hand.id, result, net: isPlayerBJ ? 0 : -hand.bet });
    updatedHands.push({ ...hand, isLocked: true, result });
  }

  // Snapshot for history
  const stackSnapshot: Record<string, number> = {};
  for (const [pid, s] of stacks) stackSnapshot[pid] = s;
  const stackHistory = [...state.stackHistory, stackSnapshot].slice(-200);

  return ok(
    {
      ...state,
      stacks,
      dealerBank,
      hands: updatedHands,
      phase: "round_summary",
      stackHistory,
    },
    [
      ...events,
      {
        type: "roundSummary",
        stacks: stackSnapshot,
        dealerBank,
      },
    ],
  );
}

// ─── Player turns ─────────────────────────────────────────────────────────────

function reduceHit(state: GameState, playerId: string, handId: string): ReducerResult {
  assertPhase(state, "player_turns");
  const hand = getActiveHand(state, handId, playerId);
  assertLegalAction(state, hand, "hit");

  const { card, shoe } = drawCard(state.shoe);
  const events: GameEvent[] = [{ type: "cardDealt", to: playerId, handId, card }];

  const updatedHand = { ...hand, cards: [...hand.cards, card] };
  const hv = evaluateHand(updatedHand.cards);

  let finalHand: Hand = updatedHand;
  if (hv.isBust) {
    finalHand = { ...updatedHand, isLocked: true, result: "bust" };
    events.push({ type: "handResult", handId, result: "bust", net: -hand.bet });
  } else if (hv.total === 21) {
    // Auto-stand at 21
    finalHand = { ...updatedHand, isLocked: true };
  }

  let s = replaceHand(state, finalHand);
  s = { ...s, shoe };
  return ok(advanceTurn(s, handId), events);
}

function reduceStand(state: GameState, playerId: string, handId: string): ReducerResult {
  assertPhase(state, "player_turns");
  const hand = getActiveHand(state, handId, playerId);

  const finalHand = { ...hand, isLocked: true };
  const s = replaceHand(state, finalHand);
  return ok(advanceTurn(s, handId), []);
}

function reduceDouble(state: GameState, playerId: string, handId: string): ReducerResult {
  assertPhase(state, "player_turns");
  const hand = getActiveHand(state, handId, playerId);
  assertLegalAction(state, hand, "double");

  const playerStack = state.stacks.get(playerId) ?? 0;
  const doubleBet = hand.bet; // equal to original bet

  // Draw one card
  const { card, shoe } = drawCard(state.shoe);
  const updatedCards = [...hand.cards, card];
  const hv = evaluateHand(updatedCards);

  const stacks = new Map(state.stacks);
  stacks.set(playerId, playerStack - doubleBet);

  const events: GameEvent[] = [
    { type: "cardDealt", to: playerId, handId, card },
    { type: "chipsBet", playerId, handId, amount: doubleBet },
  ];

  let result: Hand["result"] = "pending";
  if (hv.isBust) {
    result = "bust";
    events.push({ type: "handResult", handId, result, net: -(hand.bet + doubleBet) });
  }

  const finalHand: Hand = {
    ...hand,
    cards: updatedCards,
    doubleBet,
    isDoubled: true,
    isLocked: true, // always stands after double
    result,
  };

  const s = replaceHand({ ...state, stacks, shoe }, finalHand);
  return ok(advanceTurn(s, handId), events);
}

function reduceSplit(state: GameState, playerId: string, handId: string): ReducerResult {
  assertPhase(state, "player_turns");
  const hand = getActiveHand(state, handId, playerId);
  assertLegalAction(state, hand, "split");

  const [cardA, cardB] = hand.cards as [Card, Card];
  const isAceSplit = cardA.rank === "A";
  const newSplitDepth = hand.splitDepth + 1;

  // Deduct additional bet from player stack
  const stacks = new Map(state.stacks);
  const playerStack = stacks.get(playerId) ?? 0;
  stacks.set(playerId, playerStack - hand.bet);

  // Draw a card for hand A (the original hand, keeping card A)
  const { card: cardForA, shoe: shoe2 } = drawCard(state.shoe);
  // Draw a card for hand B (the new hand, getting card B)
  const { card: cardForB, shoe: shoe3 } = drawCard(shoe2);

  // Build hand A (updated original)
  const handA: Hand = {
    ...hand,
    cards: [cardA, cardForA],
    isSplit: true,
    isSplitAce: isAceSplit,
    splitDepth: newSplitDepth,
    isLocked: isAceSplit, // split aces: locked after one card
    result: isAceSplit ? resolveAutoStand([cardA, cardForA]) : "pending",
  };

  // Build hand B (new split hand)
  const { id: newHandId, state: stateWithNewSeq } = nextHandId(state);
  const handB: Hand = createHand(newHandId, playerId, hand.seatNumber, hand.bet, {
    splitOrder: hand.splitOrder + 1,
    splitDepth: newSplitDepth,
    isSplit: true,
    isSplitAce: isAceSplit,
  });
  const handBWithCards: Hand = {
    ...handB,
    cards: [cardB, cardForB],
    isLocked: isAceSplit,
    result: isAceSplit ? resolveAutoStand([cardB, cardForB]) : "pending",
  };

  // Insert new hand right after the original in the hands array
  const hands = state.hands.map((h) => (h.id === handId ? handA : h));
  const insertIdx = hands.findIndex((h) => h.id === handId) + 1;
  hands.splice(insertIdx, 0, handBWithCards);

  const events: GameEvent[] = [
    { type: "chipsBet", playerId, handId: newHandId, amount: hand.bet },
    { type: "cardDealt", to: playerId, handId: hand.id, card: cardForA },
    { type: "cardDealt", to: playerId, handId: newHandId, card: cardForB },
  ];

  let s: GameState = {
    ...stateWithNewSeq,
    hands,
    stacks,
    shoe: shoe3,
  };

  // If split aces, both hands locked — advance
  if (isAceSplit) {
    s = { ...s };
    return ok(advanceTurn(s, handId), events);
  }

  // Otherwise, keep playing hand A
  return ok({ ...s, activeHandId: handA.id }, events);
}

// ─── Dealer turn ─────────────────────────────────────────────────────────────

function reduceDealerReveal(state: GameState): ReducerResult {
  assertPhase(state, "dealer_turn");

  if (!state.dealerHand) throw new EngineError("ILLEGAL_ACTION", "No dealer hand");

  const holeCard = state.dealerHand.cards[1]!;
  const events: GameEvent[] = [
    { type: "cardFlipped", handId: state.dealerHand.id, card: holeCard },
  ];

  const { config } = state;

  // If all player hands are busted or resolved, dealer doesn't draw
  const allResolved = state.hands.every(
    (h) => h.result === "bust" || h.result === "blackjack" || h.result === "push",
  );

  if (allResolved) {
    const { state: settled, events: settleEvents } = performSettlement(state);
    return ok(settled, [...events, ...settleEvents]);
  }

  // Auto mode: draw dealer cards until standing
  if (config.dealerDrawMode === "auto") {
    let s = state;
    let shoe = state.shoe;
    let dealerHand = { ...state.dealerHand, cards: [...state.dealerHand.cards] };

    while (shouldDealerDraw(dealerHand.cards, config.dealerHitsSoft17)) {
      const { card, shoe: newShoe } = drawCard(shoe);
      shoe = newShoe;
      dealerHand = { ...dealerHand, cards: [...dealerHand.cards, card] };
      events.push({ type: "cardDealt", to: "dealer", handId: dealerHand.id, card });
    }

    s = { ...s, shoe, dealerHand };
    const { state: settled, events: settleEvents } = performSettlement(s);
    return ok(settled, [...events, ...settleEvents]);
  }

  // Manual mode: just reveal, dealer clicks draw manually
  return ok({ ...state, phase: "dealer_turn" }, events);
}

function reduceDealerDraw(state: GameState): ReducerResult {
  // Manual mode only
  assertPhase(state, "dealer_turn");
  if (state.config.dealerDrawMode !== "manual") {
    throw new EngineError("ILLEGAL_ACTION", "Auto draw mode — dealer cannot draw manually");
  }
  if (!state.dealerHand) throw new EngineError("ILLEGAL_ACTION", "No dealer hand");

  const { config } = state;

  if (!shouldDealerDraw(state.dealerHand.cards, config.dealerHitsSoft17)) {
    // Dealer is standing — trigger settlement
    const { state: settled, events } = performSettlement(state);
    return ok(settled, events);
  }

  const { card, shoe } = drawCard(state.shoe);
  const dealerHand = { ...state.dealerHand, cards: [...state.dealerHand.cards, card] };
  const events: GameEvent[] = [{ type: "cardDealt", to: "dealer", handId: dealerHand.id, card }];

  const hv = evaluateHand(dealerHand.cards);
  const s = { ...state, shoe, dealerHand };

  if (hv.isBust || !shouldDealerDraw(dealerHand.cards, config.dealerHitsSoft17)) {
    const { state: settled, events: settleEvents } = performSettlement(s);
    return ok(settled, [...events, ...settleEvents]);
  }

  return ok(s, events);
}

// ─── Settlement ──────────────────────────────────────────────────────────────

function performSettlement(state: GameState): ReducerResult {
  const dealerHand = state.dealerHand!;
  const dealerHv = evaluateHand(dealerHand.cards);
  const dealerTotal = dealerHv.total;
  const dealerBust = dealerHv.isBust;

  const settlements = state.hands.map((hand) =>
    settleHand(hand, dealerTotal, dealerBust, state.dealerHasBlackjack, state.config),
  );

  const events: GameEvent[] = buildSettlementEvents(settlements);

  /**
   * Chip accounting model:
   *   - When bet:lock fired, `bet` was deducted from the player's stack. Those
   *     chips are now "in flight" (not in stack, not in bank).
   *   - At settlement we must move them to their final destination.
   *
   * Settlement results from settleHand():
   *   Win:  playerGain = bet*2, bankGain = 0, net = +bet
   *         → stack += bet*2; bank -= bet (bank funds the winnings)
   *   BJ:   playerGain = bet+bjAmt, bankGain = 0, net = +bjAmt
   *         → stack += bet+bjAmt; bank -= bjAmt
   *   Push: playerGain = bet, bankGain = 0, net = 0
   *         → stack += bet; bank unchanged (in-flight chips return)
   *   Loss: playerGain = 0, bankGain = bet, net = -bet
   *         → bank += bet (in-flight chips go to bank)
   *   Bust: same as Loss
   */
  const stacks = new Map(state.stacks);
  let dealerBank = state.dealerBank;

  for (const s of settlements) {
    // Return chips to player (their bet back + any winnings)
    if (s.playerGain > 0) {
      stacks.set(s.playerId, (stacks.get(s.playerId) ?? 0) + s.playerGain);
    }
    // Chips lost by player go to bank
    if (s.bankGain > 0) {
      dealerBank += s.bankGain;
    }
    // Bank funds net winnings (positive net = bank pays out)
    if (s.net > 0) {
      dealerBank -= s.net;
    }
  }

  const updatedHands = state.hands.map((h, i) => ({
    ...h,
    result: settlements[i]?.result ?? h.result,
    isLocked: true,
  }));

  const stackSnapshot: Record<string, number> = {};
  for (const [pid, sv] of stacks) stackSnapshot[pid] = sv;
  const stackHistory = [...state.stackHistory, stackSnapshot].slice(-200);

  const finalState: GameState = {
    ...state,
    stacks,
    dealerBank,
    hands: updatedHands,
    phase: "round_summary",
    stackHistory,
  };

  return ok(finalState, [...events, { type: "roundSummary", stacks: stackSnapshot, dealerBank }]);
}

// ─── Next round ───────────────────────────────────────────────────────────────

function reduceNextRound(state: GameState): ReducerResult {
  assertPhase(state, "round_summary");

  // Apply any pending config change
  let config = state.config;
  if (state.pendingConfig) {
    const merged = { ...state.config, ...state.pendingConfig };
    const parsed = RoomConfigSchema.safeParse(merged);
    if (parsed.success) config = parsed.data;
  }

  // Reshuffle if cut card was passed
  let shoe = state.shoe;
  const events: GameEvent[] = [];
  if (shoe.cutCardPassed || shoe.cards.length < 20) {
    shoe = buildShoe(config.decks, config.penetration);
    events.push({ type: "shuffled" });
  }

  const roundNumber = state.roundNumber + 1;

  return ok(
    {
      ...state,
      config,
      phase: "betting",
      roundNumber,
      shoe,
      hands: [],
      dealerHand: null,
      lockedBets: new Map(),
      pendingBets: new Map(),
      sittingOut: new Set(),
      insurancePending: new Set(),
      insuranceDecisions: new Map(),
      dealerHasBlackjack: false,
      activeHandId: null,
      betDeadline: null,
      actionDeadline: null,
      pendingConfig: null,
    },
    [...events, { type: "roundStarted", roundNumber }],
  );
}

function reduceShuffle(state: GameState): ReducerResult {
  if (state.phase !== "betting" && state.phase !== "round_summary") {
    throw new EngineError("WRONG_PHASE", "Can only shuffle between rounds");
  }
  const shoe = buildShoe(state.config.decks, state.config.penetration);
  return ok({ ...state, shoe }, [{ type: "shuffled" }]);
}

// ─── Host chip controls ───────────────────────────────────────────────────────

function reduceAdjustChips(
  state: GameState,
  target: string,
  op: "set" | "add" | "subtract",
  amount: number,
): ReducerResult {
  const isDealer = target === "dealer";
  const current = isDealer ? state.dealerBank : (state.stacks.get(target) ?? 0);

  let newBalance: number;
  if (op === "set") newBalance = amount;
  else if (op === "add") newBalance = current + amount;
  else newBalance = Math.max(0, current - amount);

  let s: GameState;
  if (isDealer) {
    s = { ...state, dealerBank: newBalance };
  } else {
    const stacks = new Map(state.stacks);
    stacks.set(target, newBalance);
    // Also update totalBuyIn if adding chips
    const totalBuyIns = new Map(state.totalBuyIns);
    if (op === "add") {
      totalBuyIns.set(target, (totalBuyIns.get(target) ?? 0) + amount);
    } else if (op === "set" && newBalance > (state.stacks.get(target) ?? 0)) {
      totalBuyIns.set(target, (totalBuyIns.get(target) ?? 0) + (newBalance - current));
    }
    s = { ...state, stacks, totalBuyIns };
  }

  return ok(s, [{ type: "chipsAdjusted", target, op, amount, newBalance }]);
}

function reduceUpdateConfig(state: GameState, configPatch: Partial<RoomConfig>): ReducerResult {
  // Mid-round: queue the change
  if (state.phase !== "betting" && state.phase !== "round_summary" && state.phase !== "lobby") {
    const pendingConfig = { ...state.pendingConfig, ...configPatch };
    return ok({ ...state, pendingConfig }, []);
  }
  // Between rounds: apply immediately
  const merged = { ...state.config, ...configPatch };
  const parsed = RoomConfigSchema.safeParse(merged);
  if (!parsed.success) {
    throw new EngineError(
      "ILLEGAL_ACTION",
      `Invalid config: ${JSON.stringify(parsed.error.issues)}`,
    );
  }
  return ok({ ...state, config: parsed.data }, []);
}

function reduceRebuy(state: GameState, playerId: string): ReducerResult {
  // Auto-grant rebuy (no host approval variant; server wraps with approval logic)
  if (!state.config.rebuyEnabled) {
    throw new EngineError("ILLEGAL_ACTION", "Rebuys are disabled");
  }
  const stacks = new Map(state.stacks);
  const totalBuyIns = new Map(state.totalBuyIns);
  const currentStack = stacks.get(playerId) ?? 0;
  const newStack = currentStack + state.config.rebuyAmount;
  stacks.set(playerId, newStack);
  totalBuyIns.set(playerId, (totalBuyIns.get(playerId) ?? 0) + state.config.rebuyAmount);
  return ok({ ...state, stacks, totalBuyIns }, [
    {
      type: "chipsAdjusted",
      target: playerId,
      op: "add",
      amount: state.config.rebuyAmount,
      newBalance: newStack,
    },
  ]);
}

// ─── Turn advancement ─────────────────────────────────────────────────────────

/**
 * After a hand action, find the next unlocked hand.
 * If all hands are locked, transition to dealer_turn.
 */
function advanceTurn(state: GameState, _currentHandId: string): GameState {
  const nextHand = state.hands.find((h) => !h.isLocked && h.result === "pending");
  if (!nextHand) {
    // All player hands done → dealer turn
    return { ...state, phase: "dealer_turn", activeHandId: null };
  }
  return { ...state, activeHandId: nextHand.id };
}

function advanceToPlayerTurns(state: GameState): GameState {
  const firstHand = state.hands.find((h) => !h.isLocked);
  if (!firstHand) {
    // All locked (all blackjacks?) → dealer turn
    return { ...state, phase: "dealer_turn", activeHandId: null };
  }
  return { ...state, phase: "player_turns", activeHandId: firstHand.id };
}

// ─── Auto-lock helpers ────────────────────────────────────────────────────────

function autoLockBlackjacks(state: GameState): ReducerResult {
  const events: GameEvent[] = [];
  const hands = state.hands.map((hand) => {
    const hv = evaluateHand(hand.cards);
    if (hv.isBlackjack && !hand.isSplit) {
      events.push({ type: "handResult", handId: hand.id, result: "blackjack", net: 0 });
      return { ...hand, isLocked: true, result: "blackjack" as const };
    }
    return hand;
  });
  return ok({ ...state, hands }, events);
}

function resolveAutoStand(cards: Card[]): Hand["result"] {
  const hv = evaluateHand(cards);
  if (hv.isBust) return "bust";
  return "pending"; // will be settled later
}

// ─── Dealer draw logic ────────────────────────────────────────────────────────

/**
 * Should the dealer draw another card?
 * S17: dealer stands on all 17s (including soft 17) — dealerHitsSoft17 = false
 * H17: dealer hits soft 17 — dealerHitsSoft17 = true
 */
export function shouldDealerDraw(cards: Card[], dealerHitsSoft17: boolean): boolean {
  const hv = evaluateHand(cards);
  if (hv.isBust) return false;
  if (hv.total > 17) return false;
  if (hv.total < 17) return true;
  // Total === 17
  if (hv.isSoft && dealerHitsSoft17) return true;
  return false;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function ok(state: GameState, events: GameEvent[]): ReducerResult {
  return { state, events };
}

function assertPhase(state: GameState, ...phases: GameState["phase"][]): void {
  if (!phases.includes(state.phase)) {
    throw new EngineError(
      "WRONG_PHASE",
      `Expected phase ${phases.join("/")} but got ${state.phase}`,
    );
  }
}

function assertSeated(state: GameState, playerId: string): void {
  const isSeated = [...state.seatedPlayers.values()].includes(playerId);
  if (!isSeated) throw new EngineError("ILLEGAL_ACTION", "Player is not seated");
}

function getActiveHand(state: GameState, handId: string, playerId: string): Hand {
  const hand = state.hands.find((h) => h.id === handId);
  if (!hand) throw new EngineError("ILLEGAL_ACTION", "Hand not found");
  if (hand.playerId !== playerId) throw new EngineError("NOT_YOUR_TURN", "Not your hand");
  if (state.activeHandId !== handId) throw new EngineError("NOT_YOUR_TURN", "Not your turn");
  if (hand.isLocked) throw new EngineError("ILLEGAL_ACTION", "Hand is already locked");
  return hand;
}

function assertLegalAction(
  state: GameState,
  hand: Hand,
  action: import("../types/index.js").LegalAction,
): void {
  const legal = computeLegalActions(state, hand);
  if (!legal.includes(action)) {
    throw new EngineError("ILLEGAL_ACTION", `Action '${action}' is not legal for this hand`);
  }
}

function replaceHand(state: GameState, hand: Hand): GameState {
  const hands = state.hands.map((h) => (h.id === hand.id ? hand : h));
  return { ...state, hands };
}

function sortedSeatedPlayers(state: GameState): [SeatNumber, string][] {
  return [...state.seatedPlayers.entries()].sort(([a], [b]) => a - b);
}

function cardValue(card: Card): number {
  if (card.rank === "A") return 11;
  if (["J", "Q", "K"].includes(card.rank)) return 10;
  return Number(card.rank);
}

function isBlackjackHand(cards: Card[]): boolean {
  return evaluateHand(cards).isBlackjack;
}

// Re-export for use by server and tests
export type { RoomConfig };
