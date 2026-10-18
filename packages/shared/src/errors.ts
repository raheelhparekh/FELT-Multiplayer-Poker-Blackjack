/** Error codes returned when an action is rejected by an engine. */
export type EngineErrorCode =
  // Shared / General
  | "WRONG_PHASE"
  | "NOT_YOUR_TURN"
  | "ILLEGAL_ACTION"
  | "INSUFFICIENT_FUNDS"
  | "NOT_HOST"
  | "NOT_DEALER"

  // Blackjack-specific
  | "BANK_CANNOT_COVER"
  | "BET_TOO_LOW"
  | "BET_TOO_HIGH"
  | "MAX_SPLITS_REACHED"
  | "CANNOT_SPLIT"

  // Poker-specific
  | "RAISE_TOO_SMALL"
  | "RAISE_EXCEEDS_STACK"
  | "BETTING_NOT_REOPENED"
  | "HAND_NOT_ACTIVE";

export class EngineError extends Error {
  constructor(
    public readonly code: EngineErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EngineError";
  }
}
