// Card suits
export type Suit = "clubs" | "diamonds" | "hearts" | "spades";

// Card ranks
export type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";

/** A fully known card (face-up on the table). */
export interface Card {
  suit: Suit;
  rank: Rank;
}

/**
 * A card slot as sent to clients.
 * - face-up: { hidden: false; card: Card }
 * - face-down (hole card): { hidden: true }
 */
export type ClientCard = { hidden: false; card: Card } | { hidden: true };

// ─── Player / hand types ────────────────────────────────────────────────────

export type HandId = string;
export type PlayerId = string;
export type SeatNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type HandResult =
  | "blackjack" // paid 3:2 or 6:5
  | "win" // paid 1:1
  | "push" // bet returned
  | "loss" // bet lost to bank
  | "bust" // total > 21; bet lost
  | "pending"; // round still in progress

export interface Hand {
  id: HandId;
  playerId: PlayerId;
  seatNumber: SeatNumber;

  /** Cards as known to the server (full identity). */
  cards: Card[];

  bet: number;
  /** Extra bet placed on a double-down (0 if not doubled). */
  doubleBet: number;
  /** Insurance stake (0 if not taken). */
  insuranceBet: number;

  /** Position among this player's hands this round (0 = original). */
  splitOrder: number;
  /** How many times the player's seat has split so far this round. */
  splitDepth: number;

  isSplit: boolean;
  isDoubled: boolean;
  /**
   * True when this hand was created by splitting aces.
   * Limits: exactly one additional card, no resplit, no further hit.
   */
  isSplitAce: boolean;

  isSurrendered: boolean; // Phase 7+ — always false in v1
  /** Hand is fully resolved — player cannot act on it. */
  isLocked: boolean;

  result: HandResult;
}

// ─── Roles ──────────────────────────────────────────────────────────────────

export type Role = "host" | "dealer" | "player" | "spectator";

export interface Participant {
  id: PlayerId;
  displayName: string;
  avatarId: string;
  role: Role;
  seat: SeatNumber | null; // null for dealer / spectator / host-only
  isConnected: boolean;
  isGuest: boolean;
  isHost?: boolean | undefined;
  userId?: string | undefined;
}

// ─── Game phases ─────────────────────────────────────────────────────────────

export type GamePhase =
  | "lobby"
  | "betting"
  | "dealing"
  | "insurance"
  | "peek"
  | "player_turns"
  | "dealer_turn"
  | "settlement"
  | "round_summary";

// ─── Chip stacks ─────────────────────────────────────────────────────────────

export interface PlayerBankroll {
  playerId: PlayerId;
  stack: number;
  totalBuyIn: number;
  /** Net = stack − totalBuyIn */
  sessionNet: number;
}

// ─── Activity log ─────────────────────────────────────────────────────────────

export interface ActivityEntry {
  seq: number;
  ts: number; // Date.now()
  text: string;
}

// ─── Chat ──────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  seq: number;
  ts: number;
  senderId: PlayerId;
  senderName: string;
  text: string;
}

export type LegalAction = "hit" | "stand" | "double" | "split" | "insurance_yes" | "insurance_no";

// ─── Player transactions statement ──────────────────────────────────────────

export interface PlayerTransaction {
  id: string;
  roundNumber: number;
  playerId: PlayerId;
  displayName: string;
  type:
    "buy_in" | "rebuy" | "chip_request" | "round_win" | "round_loss" | "round_push" | "adjustment";
  amount: number;
  balanceAfter: number;
  status?: "pending" | "approved" | "completed" | undefined;
  details?: string;
  timestamp: number;
}

// ─── Table popup notifications ───────────────────────────────────────────────

export interface TableNotification {
  id: string;
  type: "chip_request" | "chip_approved" | "info";
  playerId?: PlayerId;
  playerName?: string;
  amount?: number;
  message: string;
  timestamp: number;
}
