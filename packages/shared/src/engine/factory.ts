import type { RoomConfig } from "../types/config.js";
import { defaultRoomConfig } from "../types/config.js";
import type { Hand, Participant, SeatNumber } from "../types/index.js";
import { buildShoe } from "./shoe.js";
import type { GameState } from "./state.js";

// ─── Hand factory ──────────────────────────────────────────────────────────

export function createHand(
  id: string,
  playerId: string,
  seatNumber: SeatNumber,
  bet: number,
  opts: Partial<Pick<Hand, "splitOrder" | "splitDepth" | "isSplit" | "isSplitAce">> = {},
): Hand {
  return {
    id,
    playerId,
    seatNumber,
    cards: [],
    bet,
    doubleBet: 0,
    insuranceBet: 0,
    splitOrder: opts.splitOrder ?? 0,
    splitDepth: opts.splitDepth ?? 0,
    isSplit: opts.isSplit ?? false,
    isDoubled: false,
    isSplitAce: opts.isSplitAce ?? false,
    isSurrendered: false,
    isLocked: false,
    result: "pending",
  };
}

// ─── State factory ──────────────────────────────────────────────────────────

export function createInitialState(
  roomCode: string,
  config: RoomConfig = defaultRoomConfig(),
): GameState {
  return {
    roomCode,
    config,
    phase: "lobby",
    isSessionStarted: false,
    isPaused: false,
    roundNumber: 0,

    participants: new Map(),
    stacks: new Map(),
    totalBuyIns: new Map(),
    dealerBank: config.dealerStartingBank,

    shoe: buildShoe(config.decks, config.penetration),

    hands: [],
    dealerHand: null,
    seatedPlayers: new Map(),

    pendingBets: new Map(),
    lastBets: new Map(),
    lockedBets: new Map(),
    sittingOut: new Set(),

    insurancePending: new Set(),
    insuranceDecisions: new Map(),

    dealerHasBlackjack: false,

    activeHandId: null,

    betDeadline: null,
    actionDeadline: null,

    stackHistory: [],
    seq: 0,
    pendingConfig: null,
  };
}

/** Add a participant to the state (immutably). */
export function addParticipant(state: GameState, p: Participant): GameState {
  const participants = new Map(state.participants);
  participants.set(p.id, p);
  const stacks = new Map(state.stacks);
  const totalBuyIns = new Map(state.totalBuyIns);
  if (!stacks.has(p.id)) {
    stacks.set(p.id, state.config.startingStack);
    totalBuyIns.set(p.id, state.config.startingStack);
  }
  return { ...state, participants, stacks, totalBuyIns };
}

/** Generate the next hand ID using the state sequence counter. */
export function nextHandId(state: GameState): { id: string; state: GameState } {
  const id = `${state.roomCode}_r${state.roundNumber}_h${state.seq}`;
  return { id, state: { ...state, seq: state.seq + 1 } };
}
