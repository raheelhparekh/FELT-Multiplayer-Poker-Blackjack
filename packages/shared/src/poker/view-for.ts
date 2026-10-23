import type { Card, ClientCard, Participant, SeatNumber, PlayerTransaction } from "../types/domain.js";
import { evaluateBestHand } from "./evaluator.js";
import type { HandWinner, PokerPhase, Pot, Street } from "./state.js";
import type { PokerState } from "./state.js";

export interface ClientPokerPlayerView {
  id: string;
  displayName: string;
  avatarId: string;
  seatNumber: SeatNumber;
  stack: number;
  committedThisRound: number;
  committedThisHand: number;
  hasFolded: boolean;
  isAllIn: boolean;
  isTurn: boolean;
  cards: ClientCard[];
  handStrengthName?: string | undefined;
  isConnected: boolean;
  hasSeenCards?: boolean;
}

export interface ClientPokerGameView {
  roomCode: string;
  gameType: "poker";
  seq: number;
  phase: PokerPhase;
  street: Street | null;
  handNumber: number;
  roundNumber: number;

  dealerButtonSeat: SeatNumber;
  smallBlindSeat: SeatNumber | null;
  bigBlindSeat: SeatNumber | null;

  communityCards: Card[];
  pots: Pot[];
  currentBet: number;
  toActPlayerId: string | null;

  players: ClientPokerPlayerView[];
  participants: Participant[];
  stacks: Record<string, number>;
  totalBuyIns?: Record<string, number>;
  initialBuyIns?: Record<string, number>;
  rebuys?: Record<string, number>;
  config: import("./config.js").PokerConfig;
  hostId?: string | undefined;
  dealerId?: string | null | undefined;
  isSessionStarted: boolean;

  myLegalActions: string[];
  actionDeadline: number | null;
  handSummaryDeadline: number | null;
  isPaused: boolean;

  winners: HandWinner[] | null;
  handHistory: PokerState["handHistory"];
  tableStatusMessage: string | null;

  transactions?: PlayerTransaction[] | undefined;
  pendingChipAdjustmentPlayers?: string[] | undefined;
}

/**
 * Filter the authoritative PokerState for a specific viewer (player or spectator).
 * Redacts hidden hole cards, undealt deck, and burned cards.
 */
export function viewFor(state: PokerState, viewerId: string): ClientPokerGameView {
  const isFoldWin = Boolean(state.winners?.some((w) => w.handName === "All other players folded"));
  const isShowdown = (state.phase === "showdown" || state.phase === "hand_summary") && !isFoldWin;

  const clientPlayers: ClientPokerPlayerView[] = [];

  for (const [pid, player] of state.players) {
    const participant = state.participants.get(pid);
    const isOwner = pid === viewerId;
    const isRevealed = (isShowdown && !player.hasFolded) || Boolean(player.showedCards);

    let cards: ClientCard[] = [];
    if (player.holeCards.length > 0) {
      if (isOwner || isRevealed) {
        cards = player.holeCards.map((c) => ({ hidden: false, card: c }));
      } else {
        cards = player.holeCards.map(() => ({ hidden: true }));
      }
    }

    // Compute hand strength label for viewer if owner and cards exist
    let handStrengthName: string | undefined;
    if (isOwner && player.holeCards.length === 2 && state.communityCards.length >= 3) {
      const best = evaluateBestHand([...player.holeCards, ...state.communityCards]);
      handStrengthName = best.name;
    }

    clientPlayers.push({
      id: pid,
      displayName: participant?.displayName ?? pid,
      avatarId: participant?.avatarId ?? "lion",
      seatNumber: player.seatNumber,
      stack: player.stack,
      committedThisRound: player.committedThisRound,
      committedThisHand: player.committedThisHand,
      hasFolded: player.hasFolded,
      isAllIn: player.isAllIn,
      isTurn: state.toActPlayerId === pid,
      cards,
      handStrengthName,
      isConnected: participant?.isConnected ?? false,
      hasSeenCards: Boolean(player.hasSeenCards),
    });
  }

  // Legal actions for the viewer
  const viewerPlayer = state.players.get(viewerId);
  const myLegalActions: string[] = [];
  if (viewerPlayer && state.toActPlayerId === viewerId && state.phase === "betting") {
    const toCall = state.currentBet - viewerPlayer.committedThisRound;
    myLegalActions.push("fold");
    if (toCall === 0) {
      myLegalActions.push("check");
    } else {
      myLegalActions.push("call");
    }
    if (state.currentBet === 0 && viewerPlayer.stack > 0) {
      myLegalActions.push("bet");
    }
    if (state.currentBet > 0 && viewerPlayer.committedThisRound + viewerPlayer.stack > state.currentBet) {
      myLegalActions.push("raise");
    }
    if (viewerPlayer.stack > 0) {
      myLegalActions.push("allIn");
    }
  }

  const hostParticipant = Array.from(state.participants.values()).find((p) => p.isHost);
  const hostId = hostParticipant?.id ?? undefined;

  const stacks: Record<string, number> = {};
  for (const [pid, p] of state.players) {
    stacks[pid] = p.stack;
  }
  for (const [pid, s] of state.stacks) {
    if (stacks[pid] === undefined) {
      stacks[pid] = s;
    }
  }

  return {
    roomCode: state.roomCode,
    gameType: "poker",
    seq: state.seq,
    phase: state.phase,
    street: state.street,
    handNumber: state.handNumber,
    roundNumber: state.handNumber,
    dealerButtonSeat: state.dealerButtonSeat,
    smallBlindSeat: state.smallBlindSeat,
    bigBlindSeat: state.bigBlindSeat,
    communityCards: state.communityCards,
    pots: state.pots,
    currentBet: state.currentBet,
    toActPlayerId: state.toActPlayerId,
    players: clientPlayers,
    participants: Array.from(state.participants.values()),
    stacks,
    totalBuyIns: Object.fromEntries(state.totalBuyIns ?? []),
    initialBuyIns: Object.fromEntries(state.initialBuyIns ?? []),
    rebuys: Object.fromEntries(state.rebuys ?? []),
    config: state.config,
    hostId,
    dealerId: null,
    isSessionStarted: state.isSessionStarted,
    myLegalActions,
    actionDeadline: state.actionDeadline,
    handSummaryDeadline: state.handSummaryDeadline,
    isPaused: state.isPaused,
    winners: state.winners,
    handHistory: state.handHistory,
    tableStatusMessage: state.tableStatusMessage,
  };
}

export function scanForPokerLeaks(view: ClientPokerGameView, fullState?: PokerState): string[] {
  const violations: string[] = [];

  if (fullState?.deck && fullState.deck.length > 0) {
    const serialized = JSON.stringify(view);
    for (const card of fullState.deck) {
      if (serialized.includes(`"rank":"${card.rank}","suit":"${card.suit}"`)) {
        violations.push(`LEAK: undealt deck card ${card.rank}${card.suit} found in client view`);
      }
    }
  }

  if (fullState?.burnedCards && fullState.burnedCards.length > 0) {
    const serialized = JSON.stringify(view);
    for (const card of fullState.burnedCards) {
      if (serialized.includes(`"rank":"${card.rank}","suit":"${card.suit}"`)) {
        violations.push(`LEAK: burned card ${card.rank}${card.suit} found in client view`);
      }
    }
  }

  for (const player of view.players) {
    for (const slot of player.cards) {
      if (slot.hidden && "card" in slot && (slot as any).card !== undefined) {
        violations.push(`LEAK: hidden card for player ${player.id} has card identity`);
      }
    }
  }

  return violations;
}
