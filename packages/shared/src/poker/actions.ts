import type { Card, SeatNumber } from "../types/domain.js";
import type { PokerConfig } from "./config.js";
import type { HandHistoryEntry, Pot, Street } from "./state.js";

export type PokerAction =
  | { type: "host:startSession" }
  | { type: "poker:startHand"; actorId?: string }
  | { type: "poker:fold"; playerId: string }
  | { type: "poker:check"; playerId: string }
  | { type: "poker:call"; playerId: string }
  | { type: "poker:bet"; playerId: string; amount: number }
  | { type: "poker:raise"; playerId: string; to: number }
  | { type: "poker:allIn"; playerId: string }
  | { type: "poker:showCards"; playerId: string }
  | { type: "poker:seeCards"; playerId: string }
  | { type: "poker:sitOut"; playerId: string }
  | { type: "poker:sitIn"; playerId: string }
  | { type: "poker:dealNextStreet"; actorId?: string }
  | { type: "poker:nextHand"; actorId?: string }
  | { type: "host:adjustChips"; target: string; op: "set" | "add" | "subtract"; amount: number }
  | { type: "host:updateConfig"; config: Partial<PokerConfig> }
  | { type: "rebuy:request"; playerId: string; amount?: number };

export type PokerEvent =
  | {
      type: "handStarted";
      handNumber: number;
      dealerButtonSeat: SeatNumber;
      smallBlindSeat: SeatNumber | null;
      bigBlindSeat: SeatNumber | null;
    }
  | {
      type: "blindsPosted";
      sbPlayerId: string;
      sbAmount: number;
      bbPlayerId: string;
      bbAmount: number;
    }
  | {
      type: "holeCardsDealt";
      to: string;
      card: Card | null; // null for viewers who are not the owner
    }
  | { type: "cardBurned" }
  | {
      type: "boardCardDealt";
      street: Street;
      card: Card;
    }
  | {
      type: "turnChanged";
      playerId: string | null;
      actionDeadline?: number | null;
    }
  | {
      type: "actionTaken";
      playerId: string;
      action: "fold" | "check" | "call" | "bet" | "raise" | "all-in";
      amount?: number;
      stackAfter: number;
    }
  | {
      type: "uncalledBetReturned";
      playerId: string;
      amount: number;
    }
  | {
      type: "betsCollected";
      pots: Pot[];
    }
  | {
      type: "handsRevealed";
      hands: Array<{ playerId: string; cards: Card[]; handName?: string }>;
    }
  | {
      type: "potAwarded";
      potIndex: number;
      winners: string[];
      amount: number;
      handName: string;
    }
  | {
      type: "handEnded";
      handNumber: number;
      summary: HandHistoryEntry;
    }
  | {
      type: "chipsAdjusted";
      target: string;
      op: string;
      amount: number;
      newBalance: number;
    }
  | { type: "playerSeenCards"; playerId: string }
  | { type: "sessionStarted" };

export interface PokerReducerResult<S = any, E = any> {
  state: S;
  events: E[];
}
