import { EngineError } from "../errors.js";
import type { Card, Participant, SeatNumber } from "../types/domain.js";
import type { PokerAction, PokerEvent, PokerReducerResult as ReducerResult } from "./actions.js";
import {
  computeLegalActions,
  determineBlindSeats,
  determineFirstToAct,
  getNextToAct,
  isBettingRoundComplete,
} from "./betting.js";
import { buildDeck, shuffleDeck } from "./cards.js";
import { evaluateBestHand } from "./evaluator.js";
import { calculateSidePots, resolvePots, type Contributor } from "./side-pots.js";
import type { HandHistoryEntry, HandWinner, PokerPlayerState, PokerState, Pot, Street } from "./state.js";

function ok(state: PokerState, events: PokerEvent[]): ReducerResult<PokerState, PokerEvent> {
  return { state, events };
}

/** Pure reducer for Poker state machine. */
export function reduce(state: PokerState, action: PokerAction): ReducerResult<PokerState, PokerEvent> {
  const result = (() => {
    switch (action.type) {
      case "host:startSession":
        return reduceStartSession(state);
      case "poker:startHand":
        return reduceStartHand(state);
      case "poker:fold":
        return reduceFold(state, action.playerId);
      case "poker:check":
        return reduceCheck(state, action.playerId);
      case "poker:call":
        return reduceCall(state, action.playerId);
      case "poker:bet":
        return reduceBet(state, action.playerId, action.amount);
      case "poker:raise":
        return reduceRaise(state, action.playerId, action.to);
      case "poker:allIn":
        return reduceAllIn(state, action.playerId);
      case "poker:showCards":
        return reduceShowCards(state, action.playerId);
      case "poker:seeCards":
        return reduceSeeCards(state, action.playerId);
      case "poker:dealNextStreet":
        return reduceDealNextStreet(state);
      case "poker:nextHand":
        return reduceNextHand(state);
      case "poker:sitOut":
        return reduceSitOut(state, action.playerId);
      case "poker:sitIn":
        return reduceSitIn(state, action.playerId);
      case "host:adjustChips":
        return reduceAdjustChips(state, action.target, action.op, action.amount);
      case "host:updateConfig":
        return reduceUpdateConfig(state, action.config);
      case "rebuy:request":
        return reduceRebuy(state, action.playerId, action.amount);
      default:
        return ok(state, []);
    }
  })();

  // Keep state.stacks synchronized with player.stack for all active players
  const nextStacks = new Map(result.state.stacks);
  for (const [pid, player] of result.state.players) {
    nextStacks.set(pid, player.stack);
  }

  return {
    state: {
      ...result.state,
      stacks: nextStacks,
    },
    events: result.events,
  };
}

// ─── Hand Start & Dealing ───────────────────────────────────────────────────

function reduceStartSession(state: PokerState): ReducerResult<PokerState, PokerEvent> {
  if (state.isSessionStarted) {
    throw new EngineError("ILLEGAL_ACTION", "Session already started");
  }
  const s = { ...state, isSessionStarted: true };
  const result = reduceStartHand(s);
  return ok(result.state, [{ type: "sessionStarted" }, ...result.events]);
}

function reduceStartHand(state: PokerState): ReducerResult<PokerState, PokerEvent> {
  const eligible = Array.from(state.participants.values()).filter(
    (p) => p.seat !== null && !state.sittingOut.has(p.id)
  );

  if (eligible.length < 2) {
    throw new EngineError("ILLEGAL_ACTION", "Need at least 2 active seated players to start a hand");
  }

  const events: PokerEvent[] = [];
  const handNumber = state.handNumber + 1;

  // Rotate button clockwise among active seated players
  const sortedSeats = eligible.map((p) => p.seat as SeatNumber).sort((a, b) => a - b);
  let nextBtnSeat = sortedSeats[0]!;
  if (state.handNumber > 0) {
    const next = sortedSeats.find((s) => s > state.dealerButtonSeat);
    nextBtnSeat = next ?? sortedSeats[0]!;
  }

  // Build fresh shuffled 52-card deck
  const deck = shuffleDeck(buildDeck());

  // Setup player states
  const players = new Map<string, PokerPlayerState>();
  for (const p of eligible) {
    const seat = p.seat as SeatNumber;
    const currentStack = state.players.get(p.id)?.stack ?? state.config.minBuyIn;
    players.set(p.id, {
      id: p.id,
      seatNumber: seat,
      holeCards: [],
      stack: currentStack,
      committedThisRound: 0,
      committedThisHand: 0,
      hasFolded: false,
      isAllIn: currentStack === 0,
      actedThisRound: false,
      hasSeenCards: false,
    });
  }

  // Determine blinds
  const seatedPlayersList = Array.from(players.values());
  const { sbSeat, bbSeat } = determineBlindSeats(nextBtnSeat, seatedPlayersList);

  events.push({
    type: "handStarted",
    handNumber,
    dealerButtonSeat: nextBtnSeat,
    smallBlindSeat: sbSeat,
    bigBlindSeat: bbSeat,
  });

  // Post Blinds
  const sbPlayer = seatedPlayersList.find((p) => p.seatNumber === sbSeat)!;
  const bbPlayer = seatedPlayersList.find((p) => p.seatNumber === bbSeat)!;

  const sbAmount = Math.min(state.config.smallBlind, sbPlayer.stack);
  sbPlayer.stack -= sbAmount;
  sbPlayer.committedThisRound += sbAmount;
  sbPlayer.committedThisHand += sbAmount;
  if (sbPlayer.stack === 0) sbPlayer.isAllIn = true;

  const bbAmount = Math.min(state.config.bigBlind, bbPlayer.stack);
  bbPlayer.stack -= bbAmount;
  bbPlayer.committedThisRound += bbAmount;
  bbPlayer.committedThisHand += bbAmount;
  if (bbPlayer.stack === 0) bbPlayer.isAllIn = true;

  events.push({
    type: "blindsPosted",
    sbPlayerId: sbPlayer.id,
    sbAmount,
    bbPlayerId: bbPlayer.id,
    bbAmount,
  });

  // Deal 2 hole cards to each player starting clockwise from button (SB)
  let cardIdx = 0;
  // Two rounds of dealing
  for (let r = 0; r < 2; r++) {
    for (const p of seatedPlayersList) {
      const card = deck[cardIdx++]!;
      p.holeCards.push(card);
      events.push({
        type: "holeCardsDealt",
        to: p.id,
        card,
      });
    }
  }

  const remainingDeck = deck.slice(cardIdx);

  // Preflop action begins after BB (or at Button/SB if heads-up)
  const firstToAct = determineFirstToAct("preflop", nextBtnSeat, sbSeat, bbSeat, players);

  const actionDeadline = state.config.actionTimerSec
    ? Date.now() + state.config.actionTimerSec * 1000
    : null;

  events.push({
    type: "turnChanged",
    playerId: firstToAct,
    actionDeadline,
  });

  const nextState: PokerState = {
    ...state,
    phase: "betting",
    street: "preflop",
    handNumber,
    dealerButtonSeat: nextBtnSeat,
    smallBlindSeat: sbSeat,
    bigBlindSeat: bbSeat,
    deck: remainingDeck,
    communityCards: [],
    burnedCards: [],
    pots: [],
    currentBet: state.config.bigBlind,
    lastFullRaiseSize: state.config.bigBlind,
    toActPlayerId: firstToAct,
    players,
    winners: null,
    actionDeadline,
    handSummaryDeadline: null,
    seq: state.seq + 1,
  };

  return ok(nextState, events);
}

// ─── Player Actions ──────────────────────────────────────────────────────────

function assertTurn(state: PokerState, playerId: string): PokerPlayerState {
  if (state.phase !== "betting") {
    throw new EngineError("WRONG_PHASE", `Cannot act in phase ${state.phase}`);
  }
  if (state.toActPlayerId !== playerId) {
    throw new EngineError("NOT_YOUR_TURN", "It is not your turn to act");
  }
  const player = state.players.get(playerId);
  if (!player) {
    throw new EngineError("ILLEGAL_ACTION", "Player not in this hand");
  }
  return player;
}

function reduceFold(state: PokerState, playerId: string): ReducerResult<PokerState, PokerEvent> {
  const player = assertTurn(state, playerId);
  player.hasFolded = true;
  player.actedThisRound = true;

  const events: PokerEvent[] = [
    {
      type: "actionTaken",
      playerId,
      action: "fold",
      stackAfter: player.stack,
    },
  ];

  return advanceAction(state, events);
}

function reduceCheck(state: PokerState, playerId: string): ReducerResult<PokerState, PokerEvent> {
  const player = assertTurn(state, playerId);
  const legal = computeLegalActions(
    playerId,
    player,
    state.currentBet,
    state.lastFullRaiseSize,
    state.config.bigBlind
  );
  if (!legal.canCheck) {
    throw new EngineError("ILLEGAL_ACTION", "Cannot check; must call or fold");
  }

  player.actedThisRound = true;

  const events: PokerEvent[] = [
    {
      type: "actionTaken",
      playerId,
      action: "check",
      stackAfter: player.stack,
    },
  ];

  return advanceAction(state, events);
}

function reduceCall(state: PokerState, playerId: string): ReducerResult<PokerState, PokerEvent> {
  const player = assertTurn(state, playerId);
  const toCall = state.currentBet - player.committedThisRound;
  if (toCall <= 0) {
    return reduceCheck(state, playerId);
  }

  const callAmount = Math.min(toCall, player.stack);
  player.stack -= callAmount;
  player.committedThisRound += callAmount;
  player.committedThisHand += callAmount;
  player.actedThisRound = true;
  if (player.stack === 0) player.isAllIn = true;

  const events: PokerEvent[] = [
    {
      type: "actionTaken",
      playerId,
      action: player.isAllIn ? "all-in" : "call",
      amount: callAmount,
      stackAfter: player.stack,
    },
  ];

  return advanceAction(state, events);
}

function reduceBet(
  state: PokerState,
  playerId: string,
  amount: number
): ReducerResult<PokerState, PokerEvent> {
  const player = assertTurn(state, playerId);
  const legal = computeLegalActions(
    playerId,
    player,
    state.currentBet,
    state.lastFullRaiseSize,
    state.config.bigBlind
  );
  if (!legal.canBet) {
    throw new EngineError("ILLEGAL_ACTION", "Cannot bet; there is already a bet on the table");
  }
  if (amount < legal.minBet && amount < player.stack) {
    throw new EngineError("ILLEGAL_ACTION", `Bet too low; minimum bet is ${legal.minBet}`);
  }
  if (amount > player.stack) {
    throw new EngineError("INSUFFICIENT_FUNDS", "Bet exceeds current stack");
  }

  player.stack -= amount;
  player.committedThisRound += amount;
  player.committedThisHand += amount;
  player.actedThisRound = true;
  if (player.stack === 0) player.isAllIn = true;

  // Update round bet tracking
  const nextCurrentBet = amount;
  const nextLastFullRaise = amount;

  // Re-open action for other players
  for (const [id, p] of state.players) {
    if (id !== playerId && !p.hasFolded && !p.isAllIn) {
      p.actedThisRound = false;
    }
  }

  const events: PokerEvent[] = [
    {
      type: "actionTaken",
      playerId,
      action: player.isAllIn ? "all-in" : "bet",
      amount,
      stackAfter: player.stack,
    },
  ];

  const s: PokerState = {
    ...state,
    currentBet: nextCurrentBet,
    lastFullRaiseSize: nextLastFullRaise,
  };

  return advanceAction(s, events);
}

function reduceRaise(
  state: PokerState,
  playerId: string,
  to: number
): ReducerResult<PokerState, PokerEvent> {
  const player = assertTurn(state, playerId);
  const legal = computeLegalActions(
    playerId,
    player,
    state.currentBet,
    state.lastFullRaiseSize,
    state.config.bigBlind
  );
  if (!legal.canRaise) {
    throw new EngineError("ILLEGAL_ACTION", "Cannot raise at this time");
  }

  const additionalChips = to - player.committedThisRound;
  if (additionalChips > player.stack) {
    throw new EngineError("RAISE_EXCEEDS_STACK", "Raise exceeds player stack");
  }

  const raiseIncrement = to - state.currentBet;
  const isAllIn = additionalChips === player.stack;

  // Check min raise bounds
  if (!isAllIn && to < legal.minRaiseTo) {
    throw new EngineError("RAISE_TOO_SMALL", `Raise to ₹${to} is below minimum raise ₹${legal.minRaiseTo}`);
  }

  player.stack -= additionalChips;
  player.committedThisRound = to;
  player.committedThisHand += additionalChips;
  player.actedThisRound = true;
  if (player.stack === 0) player.isAllIn = true;

  // Full raise reopens action to players who have already acted
  const isFullRaise = raiseIncrement >= state.lastFullRaiseSize;
  if (isFullRaise) {
    for (const [id, p] of state.players) {
      if (id !== playerId && !p.hasFolded && !p.isAllIn) {
        p.actedThisRound = false;
      }
    }
  }

  const events: PokerEvent[] = [
    {
      type: "actionTaken",
      playerId,
      action: isAllIn ? "all-in" : "raise",
      amount: to,
      stackAfter: player.stack,
    },
  ];

  const s: PokerState = {
    ...state,
    currentBet: to,
    lastFullRaiseSize: isFullRaise ? raiseIncrement : state.lastFullRaiseSize,
  };

  return advanceAction(s, events);
}

function reduceAllIn(state: PokerState, playerId: string): ReducerResult<PokerState, PokerEvent> {
  const player = assertTurn(state, playerId);
  const totalCommit = player.committedThisRound + player.stack;
  if (state.currentBet === 0) {
    return reduceBet(state, playerId, player.stack);
  }
  if (totalCommit <= state.currentBet) {
    return reduceCall(state, playerId);
  }
  return reduceRaise(state, playerId, totalCommit);
}

// ─── Turn Advancement & Street Dealing ──────────────────────────────────────

function advanceAction(state: PokerState, events: PokerEvent[]): ReducerResult<PokerState, PokerEvent> {
  const activeNonFolded = Array.from(state.players.values()).filter((p) => !p.hasFolded);

  // 1. If only 1 player remains, hand ends immediately!
  if (activeNonFolded.length === 1) {
    return resolveFoldWin(state, activeNonFolded[0]!, events);
  }

  // 2. Check if the betting round is complete
  if (isBettingRoundComplete(state.players, state.currentBet)) {
    return advanceStreet(state, events);
  }

  // 3. Move to next player to act
  const nextPlayerId = getNextToAct(state.toActPlayerId!, state.players);
  const actionDeadline = state.config.actionTimerSec
    ? Date.now() + state.config.actionTimerSec * 1000
    : null;

  events.push({
    type: "turnChanged",
    playerId: nextPlayerId,
    actionDeadline,
  });

  return ok(
    {
      ...state,
      toActPlayerId: nextPlayerId,
      actionDeadline,
      seq: state.seq + 1,
    },
    events
  );
}

function resolveFoldWin(
  state: PokerState,
  winner: PokerPlayerState,
  events: PokerEvent[]
): ReducerResult<PokerState, PokerEvent> {
  // Return any uncalled bet if winner committed more than any opponent
  const otherPlayers = Array.from(state.players.values()).filter((p) => p.id !== winner.id);
  const maxOtherCommit = otherPlayers.length > 0 ? Math.max(...otherPlayers.map((p) => p.committedThisHand)) : 0;

  if (winner.committedThisHand > maxOtherCommit) {
    const uncalled = winner.committedThisHand - maxOtherCommit;
    winner.stack += uncalled;
    winner.committedThisHand = maxOtherCommit;
    events.push({
      type: "uncalledBetReturned",
      playerId: winner.id,
      amount: uncalled,
    });
  }

  // Collect all committed chips into pots
  const contributors: Contributor[] = Array.from(state.players.values()).map((p) => ({
    playerId: p.id,
    totalCommitted: p.committedThisHand,
    hasFolded: p.hasFolded,
    isAllIn: p.isAllIn,
    seatNumber: p.seatNumber,
  }));

  const pots = calculateSidePots(contributors);
  const totalPot = pots.reduce((sum, pot) => sum + pot.amount, 0);

  // Award everything to the last remaining player
  winner.stack += totalPot;

  // Clear committedThisRound for all players
  for (const p of state.players.values()) {
    p.committedThisRound = 0;
    p.actedThisRound = false;
  }

  events.push({
    type: "potAwarded",
    potIndex: 0,
    winners: [winner.id],
    amount: totalPot,
    handName: "All other players folded",
  });

  const historyEntry: HandHistoryEntry = {
    handNumber: state.handNumber,
    timestamp: Date.now(),
    dealerButtonSeat: state.dealerButtonSeat,
    communityCards: state.communityCards,
    pots,
    winners: [
      {
        playerId: winner.id,
        potIndex: 0,
        amount: totalPot,
        handName: "All other players folded",
      },
    ],
    playerSummaries: Array.from(state.players.values()).map((p) => ({
      playerId: p.id,
      displayName: state.participants.get(p.id)?.displayName ?? p.id,
      net: p.stack - (state.totalBuyIns.get(p.id) ?? state.config.minBuyIn),
      folded: p.hasFolded,
    })),
  };

  events.push({
    type: "handEnded",
    handNumber: state.handNumber,
    summary: historyEntry,
  });

  const nextState: PokerState = {
    ...state,
    phase: "hand_summary",
    pots,
    toActPlayerId: null,
    actionDeadline: null,
    handSummaryDeadline: Date.now() + state.config.autoNextHandDelaySec * 1000,
    winners: [
      {
        playerId: winner.id,
        potIndex: 0,
        amount: totalPot,
        handName: "All other players folded",
      },
    ],
    handHistory: [historyEntry, ...state.handHistory].slice(0, 100),
    seq: state.seq + 1,
  };

  return ok(nextState, events);
}

function advanceStreet(state: PokerState, events: PokerEvent[]): ReducerResult<PokerState, PokerEvent> {
  // Collect round bets into pots
  const contributors: Contributor[] = Array.from(state.players.values()).map((p) => ({
    playerId: p.id,
    totalCommitted: p.committedThisHand,
    hasFolded: p.hasFolded,
    isAllIn: p.isAllIn,
    seatNumber: p.seatNumber,
  }));

  const pots = calculateSidePots(contributors);
  events.push({ type: "betsCollected", pots });

  // Reset round commitments
  for (const p of state.players.values()) {
    p.committedThisRound = 0;
    p.actedThisRound = false;
  }

  const activeNonFolded = Array.from(state.players.values()).filter((p) => !p.hasFolded);
  const playersCanBet = activeNonFolded.filter((p) => !p.isAllIn);

  // If ≤1 player can still bet (all-in runout) or river was just completed, run out to showdown!
  if (playersCanBet.length <= 1 || state.street === "river") {
    return runoutAndShowdown(state, pots, events);
  }

  // Advance to next street (preflop -> flop, flop -> turn, turn -> river)
  let nextStreet: Street;
  let cardsToDealCount = 0;

  if (state.street === "preflop") {
    nextStreet = "flop";
    cardsToDealCount = 3;
  } else if (state.street === "flop") {
    nextStreet = "turn";
    cardsToDealCount = 1;
  } else {
    nextStreet = "river";
    cardsToDealCount = 1;
  }

  // Burn 1 card
  const deck = [...state.deck];
  const burnCard = deck.shift()!;
  events.push({ type: "cardBurned" });

  // Deal community cards
  const newCommunity = [...state.communityCards];
  for (let i = 0; i < cardsToDealCount; i++) {
    const card = deck.shift()!;
    newCommunity.push(card);
    events.push({
      type: "boardCardDealt",
      street: nextStreet,
      card,
    });
  }

  // Determine who acts first post-flop
  const firstToAct = determineFirstToAct(
    nextStreet,
    state.dealerButtonSeat,
    state.smallBlindSeat!,
    state.bigBlindSeat!,
    state.players
  );

  const actionDeadline = state.config.actionTimerSec
    ? Date.now() + state.config.actionTimerSec * 1000
    : null;

  events.push({
    type: "turnChanged",
    playerId: firstToAct,
    actionDeadline,
  });

  const nextState: PokerState = {
    ...state,
    phase: "betting",
    street: nextStreet,
    deck,
    communityCards: newCommunity,
    burnedCards: [...state.burnedCards, burnCard],
    pots,
    currentBet: 0,
    lastFullRaiseSize: state.config.bigBlind,
    toActPlayerId: firstToAct,
    actionDeadline,
    seq: state.seq + 1,
  };

  return ok(nextState, events);
}

function runoutAndShowdown(
  state: PokerState,
  pots: Pot[],
  events: PokerEvent[]
): ReducerResult<PokerState, PokerEvent> {
  const deck = [...state.deck];
  const newCommunity = [...state.communityCards];
  const burned = [...state.burnedCards];

  // Run out board cards if not all dealt
  const targetCards = 5;
  while (newCommunity.length < targetCards) {
    if (newCommunity.length === 0) {
      // Flop: burn 1, deal 3
      burned.push(deck.shift()!);
      events.push({ type: "cardBurned" });
      for (let i = 0; i < 3; i++) {
        const c = deck.shift()!;
        newCommunity.push(c);
        events.push({ type: "boardCardDealt", street: "flop", card: c });
      }
    } else if (newCommunity.length === 3) {
      // Turn: burn 1, deal 1
      burned.push(deck.shift()!);
      events.push({ type: "cardBurned" });
      const c = deck.shift()!;
      newCommunity.push(c);
      events.push({ type: "boardCardDealt", street: "turn", card: c });
    } else if (newCommunity.length === 4) {
      // River: burn 1, deal 1
      burned.push(deck.shift()!);
      events.push({ type: "cardBurned" });
      const c = deck.shift()!;
      newCommunity.push(c);
      events.push({ type: "boardCardDealt", street: "river", card: c });
    }
  }

  // Reveal hands of all active (non-folded) players
  const revealedHands = Array.from(state.players.values())
    .filter((p) => !p.hasFolded)
    .map((p) => {
      const ev = evaluateBestHand([...p.holeCards, ...newCommunity]);
      return {
        playerId: p.id,
        cards: p.holeCards,
        handName: ev.name,
      };
    });

  events.push({ type: "handsRevealed", hands: revealedHands });

  // Resolve pots
  const winners = resolvePots(
    pots,
    state.players,
    newCommunity,
    state.dealerButtonSeat,
    state.config.chipUnit
  );

  for (const w of winners) {
    const player = state.players.get(w.playerId);
    if (player) {
      player.stack += w.amount;
    }
    events.push({
      type: "potAwarded",
      potIndex: w.potIndex,
      winners: [w.playerId],
      amount: w.amount,
      handName: w.handName,
    });
  }

  const historyEntry: HandHistoryEntry = {
    handNumber: state.handNumber,
    timestamp: Date.now(),
    dealerButtonSeat: state.dealerButtonSeat,
    communityCards: newCommunity,
    pots,
    winners,
    playerSummaries: Array.from(state.players.values()).map((p) => ({
      playerId: p.id,
      displayName: state.participants.get(p.id)?.displayName ?? p.id,
      holeCards: p.hasFolded ? undefined : p.holeCards,
      net: p.stack - (state.totalBuyIns.get(p.id) ?? state.config.minBuyIn),
      folded: p.hasFolded,
    })),
  };

  events.push({
    type: "handEnded",
    handNumber: state.handNumber,
    summary: historyEntry,
  });

  const nextState: PokerState = {
    ...state,
    phase: "hand_summary",
    deck,
    communityCards: newCommunity,
    burnedCards: burned,
    pots,
    toActPlayerId: null,
    actionDeadline: null,
    handSummaryDeadline: Date.now() + state.config.autoNextHandDelaySec * 1000,
    winners,
    handHistory: [historyEntry, ...state.handHistory].slice(0, 100),
    seq: state.seq + 1,
  };

  return ok(nextState, events);
}

function reduceShowCards(state: PokerState, playerId: string): ReducerResult<PokerState, PokerEvent> {
  const player = state.players.get(playerId);
  if (!player || player.hasFolded) return ok(state, []);

  player.showedCards = true;
  return ok(state, [
    {
      type: "handsRevealed",
      hands: [{ playerId, cards: player.holeCards }],
    },
  ]);
}

function reduceSeeCards(state: PokerState, playerId: string): ReducerResult<PokerState, PokerEvent> {
  const player = state.players.get(playerId);
  if (!player) return ok(state, []);
  if (player.hasSeenCards) return ok(state, []);

  player.hasSeenCards = true;
  return ok(
    {
      ...state,
      seq: state.seq + 1,
    },
    [
      {
        type: "playerSeenCards",
        playerId,
      },
    ]
  );
}

function reduceDealNextStreet(state: PokerState): ReducerResult<PokerState, PokerEvent> {
  return advanceStreet(state, []);
}

function reduceNextHand(state: PokerState): ReducerResult<PokerState, PokerEvent> {
  return reduceStartHand(state);
}

function reduceSitOut(state: PokerState, playerId: string): ReducerResult<PokerState, PokerEvent> {
  const sittingOut = new Set(state.sittingOut);
  sittingOut.add(playerId);

  const player = state.players.get(playerId);
  if (player && state.toActPlayerId === playerId) {
    // If sitting out on their turn, auto-fold
    player.hasFolded = true;
    const s = { ...state, sittingOut };
    return advanceAction(s, [{ type: "actionTaken", playerId, action: "fold", stackAfter: player.stack }]);
  }

  return ok({ ...state, sittingOut }, []);
}

function reduceSitIn(state: PokerState, playerId: string): ReducerResult<PokerState, PokerEvent> {
  const sittingOut = new Set(state.sittingOut);
  sittingOut.delete(playerId);
  return ok({ ...state, sittingOut }, []);
}

function reduceAdjustChips(
  state: PokerState,
  targetId: string,
  op: "set" | "add" | "subtract" = "set",
  amount: number
): ReducerResult<PokerState, PokerEvent> {
  const player = state.players.get(targetId);
  if (!player) return ok(state, []);

  let newBalance = player.stack;
  if (op === "set") newBalance = amount;
  else if (op === "add") newBalance += amount;
  else if (op === "subtract") newBalance = Math.max(0, newBalance - amount);

  player.stack = newBalance;

  return ok(state, [
    {
      type: "chipsAdjusted",
      target: targetId,
      op,
      amount,
      newBalance,
    },
  ]);
}

function reduceUpdateConfig(
  state: PokerState,
  config: Partial<PokerState["config"]>
): ReducerResult<PokerState, PokerEvent> {
  return ok({ ...state, config: { ...state.config, ...config } }, []);
}

function reduceRebuy(
  state: PokerState,
  playerId: string,
  amount?: number
): ReducerResult<PokerState, PokerEvent> {
  const player = state.players.get(playerId);
  if (!player) return ok(state, []);

  const rebuyAmount = amount ?? state.config.minBuyIn;
  player.stack += rebuyAmount;

  const totalBuyIns = new Map(state.totalBuyIns);
  totalBuyIns.set(playerId, (totalBuyIns.get(playerId) ?? 0) + rebuyAmount);

  const rebuys = new Map(state.rebuys);
  rebuys.set(playerId, (rebuys.get(playerId) ?? 0) + rebuyAmount);

  const stacks = new Map(state.stacks);
  stacks.set(playerId, player.stack);

  return ok({ ...state, totalBuyIns, rebuys, stacks }, []);
}
