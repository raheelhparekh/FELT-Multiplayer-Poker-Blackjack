// ─── Pacing beats (milliseconds) ─────────────────────────────────────────────
// These are used by the server to space event emission, ensuring all clients
// see the same animation rhythm regardless of network jitter.

export const TIMING = {
  /** Gap between each dealt card during the deal phase. */
  DEAL_CARD_MS: 350,
  /** Hole card flip (dealer reveal). */
  CARD_FLIP_MS: 450,
  /** Dealer drawing a card in DEALER_TURN. */
  DEALER_DRAW_MS: 700,
  /** Chip settlement animation per hand. */
  SETTLE_PER_HAND_MS: 600,
  /** Full shuffle animation duration. */
  SHUFFLE_MS: 2200,
  /** Insurance decision window (default, overridden by actionTimerSec). */
  INSURANCE_TIMER_MS: 15_000,
} as const;

// ─── Room defaults ────────────────────────────────────────────────────────────

export const ROOM = {
  /** How many minutes before an empty room is destroyed. */
  EMPTY_ROOM_TTL_MINUTES: 120,
  /** How many minutes a disconnected player holds their seat. */
  SEAT_HOLD_MINUTES: 15,
  /** Room code length. */
  CODE_LENGTH: 6,
  /** Alphabet for room codes — no ambiguous chars (0/O/1/I/L). */
  CODE_ALPHABET: "ABCDEFGHJKMNPQRSTUVWXYZ23456789",
  /** Max activity log entries kept in memory. */
  MAX_ACTIVITY_LOG: 200,
  /** Max chat messages kept in memory. */
  MAX_CHAT_LOG: 200,
  /**
   * Seconds the game waits for a disconnected host or dealer to reconnect
   * before auto-transferring host or ending the session.
   */
  HOST_DEALER_GRACE_SECONDS: 90,
  /**
   * Seconds the game auto-stands an active player who disconnects while the
   * action timer is DISABLED. When the timer is enabled, the normal timer
   * deadline is used instead.
   */
  DISCONNECT_GRACE_SECONDS: 20,
  /** Snapshot schema version — increment when serialized shape changes. */
  SNAPSHOT_VERSION: 1,
} as const;

// ─── Chat ─────────────────────────────────────────────────────────────────────

export const CHAT = {
  MAX_LENGTH: 300,
  /** Rate limit: max messages per window. */
  RATE_LIMIT_COUNT: 5,
  /** Rate limit window in milliseconds. */
  RATE_LIMIT_WINDOW_MS: 5_000,
} as const;

// ─── Blackjack payouts ────────────────────────────────────────────────────────

export const PAYOUT = {
  WIN: 1,
  BLACKJACK_3_2_NUMERATOR: 3,
  BLACKJACK_3_2_DENOMINATOR: 2,
  BLACKJACK_6_5_NUMERATOR: 6,
  BLACKJACK_6_5_DENOMINATOR: 5,
  INSURANCE: 2,
  PUSH: 0,
} as const;

// ─── Deck ─────────────────────────────────────────────────────────────────────

export const DECK = {
  CARDS_PER_DECK: 52,
  SUITS: ["clubs", "diamonds", "hearts", "spades"] as const,
  RANKS: ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"] as const,
} as const;
