import type { Card } from "../types/index.js";
import type { GameState } from "./state.js";

// ─── Player intents (sent from server after validation) ───────────────────────

export type GameAction =
  // Session
  | { type: "host:startSession" }

  // Betting phase
  | { type: "bet:add"; playerId: string; amount: number }
  | { type: "bet:undo"; playerId: string }
  | { type: "bet:clear"; playerId: string }
  | { type: "bet:repeat"; playerId: string }
  | { type: "bet:lock"; playerId: string }
  | { type: "bet:sitOut"; playerId: string }

  // Dealer controls
  | { type: "dealer:deal"; dealerId: string }
  | { type: "dealer:reveal"; dealerId: string }
  | { type: "dealer:draw"; dealerId: string } // manual mode: draw one card
  | { type: "dealer:nextRound"; actorId: string }
  | { type: "dealer:shuffle"; dealerId: string }

  // Player hand actions (cards drawn from shoe inside reducer)
  | { type: "play:hit"; playerId: string; handId: string }
  | { type: "play:stand"; playerId: string; handId: string }
  | { type: "play:double"; playerId: string; handId: string }
  | { type: "play:split"; playerId: string; handId: string }
  | { type: "play:insurance"; playerId: string; handId: string; accept: boolean }

  // Host chip controls (allowed between rounds; queued mid-round)
  | { type: "host:adjustChips"; target: string; op: "set" | "add" | "subtract"; amount: number }
  | { type: "host:updateConfig"; config: Partial<import("../types/config.js").RoomConfig> }

  // Rebuy
  | { type: "rebuy:request"; playerId: string };

// ─── Engine events emitted alongside state changes ─────────────────────────

export type GameEvent =
  | { type: "shuffled" }
  | { type: "cardDealt"; to: string; handId: string; card: Card | null } // null = hidden
  | { type: "cardFlipped"; handId: string; card: Card }
  | { type: "chipsBet"; playerId: string; handId: string; amount: number }
  | { type: "chipsPaid"; to: string; handId: string; amount: number }
  | { type: "chipsSwept"; from: string; handId: string; amount: number }
  | { type: "turnChanged"; handId: string | null }
  | { type: "handResult"; handId: string; result: string; net: number }
  | { type: "roundSummary"; stacks: Record<string, number>; dealerBank: number }
  | { type: "chipsAdjusted"; target: string; op: string; amount: number; newBalance: number }
  | { type: "sessionStarted" }
  | { type: "roundStarted"; roundNumber: number }
  | { type: "insuranceOffered"; handId: string }
  | { type: "insuranceResolved"; dealerHasBlackjack: boolean };

export interface ReducerResult {
  state: GameState;
  events: GameEvent[];
}

/** Error codes returned when an action is rejected. */
export type EngineErrorCode =
  | "WRONG_PHASE"
  | "NOT_YOUR_TURN"
  | "ILLEGAL_ACTION"
  | "BANK_CANNOT_COVER"
  | "INSUFFICIENT_FUNDS"
  | "BET_TOO_LOW"
  | "BET_TOO_HIGH"
  | "MAX_SPLITS_REACHED"
  | "CANNOT_SPLIT"
  | "NOT_HOST"
  | "NOT_DEALER";

export class EngineError extends Error {
  constructor(
    public readonly code: EngineErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EngineError";
  }
}
