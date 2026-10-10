import type { RoomConfig } from "../types/config.js";
import type { GamePhase, Hand, Participant, SeatNumber } from "../types/index.js";
import type { Shoe } from "./shoe.js";

/** Authoritative server-side game state. Never sent wholesale to clients. */
export interface GameState {
  roomCode: string;
  config: RoomConfig;
  phase: GamePhase;
  isSessionStarted: boolean;
  isPaused: boolean;
  roundNumber: number;
  hostId?: string | undefined;
  dealerId?: string | null | undefined;

  // ─── Participants ──────────────────────────────────────────────────────────
  participants: Map<string, Participant>;

  // ─── Bankrolls ─────────────────────────────────────────────────────────────
  stacks: Map<string, number>; // playerId → current chip stack
  totalBuyIns: Map<string, number>; // playerId → cumulative buy-in
  initialBuyIns: Map<string, number>; // playerId → chips entered with
  rebuys: Map<string, number>; // playerId → additional chips asked & approved
  dealerBank: number;
  dealerTotalBuyIn: number;

  // ─── Shoe ──────────────────────────────────────────────────────────────────
  shoe: Shoe;

  // ─── Current round ─────────────────────────────────────────────────────────
  hands: Hand[]; // player hands, sorted by (seatNumber, splitOrder)
  dealerHand: Hand | null;
  dealerHoleCardRevealed: boolean;
  seatedPlayers: Map<SeatNumber, string>; // seat → playerId for this round

  // ─── Betting phase ─────────────────────────────────────────────────────────
  pendingBets: Map<string, number>; // playerId → chips stacked before lock
  lastBets: Map<string, number>; // playerId → bet from previous round (for repeat)
  lockedBets: Map<string, number>; // playerId → confirmed bet (chips already deducted)
  sittingOut: Set<string>; // playerIds sitting out this round

  // ─── Insurance phase ───────────────────────────────────────────────────────
  /** playerIds who have NOT yet submitted an insurance decision */
  insurancePending: Set<string>;
  /** playerId → whether they accepted insurance */
  insuranceDecisions: Map<string, boolean>;

  // ─── Server-only peek result (NEVER sent to any client) ───────────────────
  dealerHasBlackjack: boolean;

  // ─── Turn tracking ─────────────────────────────────────────────────────────
  activeHandId: string | null;

  // ─── Timers (epoch ms; managed by server, stored for reconnect) ───────────
  betDeadline: number | null;
  actionDeadline: number | null;
  /** Insurance timer deadline (epoch ms). null when not in insurance phase. */
  insuranceDeadline: number | null;

  // ─── Pause timer storage ───────────────────────────────────────────────────
  /**
   * When the game is paused, stores remaining milliseconds for each active timer
   * so they can be restored accurately when the host resumes.
   * Null means not paused or no timer was active.
   */
  pausedRemainingMs: {
    bet: number | null;
    action: number | null;
    insurance: number | null;
  } | null;

  // ─── History ───────────────────────────────────────────────────────────────
  /** Stack snapshot per player per round, for sparklines (max 200) */
  stackHistory: Array<Record<string, number>>;

  // ─── Sequence counter ──────────────────────────────────────────────────────
  seq: number;

  // ─── Pending config change (queued mid-round) ─────────────────────────────
  pendingConfig: Partial<RoomConfig> | null;

  // ─── Table status message (authoritative, derived server-side) ─────────────
  /**
   * Human-readable status message for the current table state.
   * Derived by the server and sent in every snapshot so the client never invents state.
   */
  tableStatusMessage: string | null;

  // ─── Disconnect / waiting state ────────────────────────────────────────────
  /**
   * Set when host or dealer is in a reconnect grace period.
   * Displayed to all clients: e.g. "Waiting for host to reconnect (72s remaining)".
   */
  waitingForReconnect: string | null;
}
