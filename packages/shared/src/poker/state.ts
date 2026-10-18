import type { Card, Participant, SeatNumber } from "../types/domain.js";
import type { PokerConfig } from "./config.js";
import type { HandEvaluation } from "./evaluator.js";

export type PokerPhase =
  | "lobby"
  | "dealing"
  | "betting"
  | "showdown"
  | "hand_summary";

export type Street = "preflop" | "flop" | "turn" | "river";

export interface Pot {
  amount: number;
  /** Players eligible to win this pot (those who contributed and haven't folded). */
  eligiblePlayerIds: string[];
}

export interface PokerPlayerState {
  id: string;
  seatNumber: SeatNumber;
  /** Full cards server-side. */
  holeCards: Card[];
  stack: number;
  committedThisRound: number;
  committedThisHand: number;
  hasFolded: boolean;
  isAllIn: boolean;
  actedThisRound: boolean;
  /** If the player voluntarily showed their cards at the end. */
  showedCards?: boolean;
  /** Whether the player has peeked at / seen their hole cards during this hand. */
  hasSeenCards?: boolean;
}

export interface HandWinner {
  playerId: string;
  potIndex: number;
  amount: number;
  handName: string;
  evaluation?: HandEvaluation;
}

export interface HandHistoryEntry {
  handNumber: number;
  timestamp: number;
  dealerButtonSeat: SeatNumber;
  communityCards: Card[];
  pots: Pot[];
  winners: HandWinner[];
  playerSummaries: Array<{
    playerId: string;
    displayName: string;
    holeCards?: Card[] | undefined;
    net: number;
    folded: boolean;
  }>;
}

export interface PokerState {
  roomCode: string;
  config: PokerConfig;
  phase: PokerPhase;
  street: Street | null;
  handNumber: number;

  dealerButtonSeat: SeatNumber;
  smallBlindSeat: SeatNumber | null;
  bigBlindSeat: SeatNumber | null;

  /** Authoritative 52-card deck (server only). */
  deck: Card[];
  communityCards: Card[];
  burnedCards: Card[];

  pots: Pot[];
  currentBet: number;
  lastFullRaiseSize: number;
  toActPlayerId: string | null;

  players: Map<string, PokerPlayerState>;
  participants: Map<string, Participant>;
  seatedPlayers: Map<SeatNumber, string>;
  stacks: Map<string, number>;
  totalBuyIns: Map<string, number>;
  initialBuyIns: Map<string, number>;
  rebuys: Map<string, number>;
  sittingOut: Set<string>;

  actionDeadline: number | null;
  handSummaryDeadline: number | null;
  pausedRemainingMs: number | null;

  winners: HandWinner[] | null;
  handHistory: HandHistoryEntry[];

  seq: number;
  isSessionStarted: boolean;
  isPaused: boolean;
  tableStatusMessage: string | null;
}
