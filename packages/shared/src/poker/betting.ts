import type { SeatNumber } from "../types/domain.js";
import type { PokerPlayerState } from "./state.js";

export interface LegalActions {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canBet: boolean;
  minBet: number;
  maxBet: number;
  canRaise: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
  canAllIn: boolean;
  allInAmount: number;
}

/** Get seated players in clockwise order starting after a given seat. */
export function getSeatedOrderAfter(
  seat: SeatNumber,
  players: Map<string, PokerPlayerState>,
  seatsTotal: number = 9
): PokerPlayerState[] {
  const activeList = Array.from(players.values()).sort((a, b) => a.seatNumber - b.seatNumber);
  const after = activeList.filter((p) => p.seatNumber > seat);
  const beforeOrAt = activeList.filter((p) => p.seatNumber <= seat);
  return [...after, ...beforeOrAt];
}

/** Determine SB and BB seats based on dealer button seat and active seated players. */
export function determineBlindSeats(
  dealerButtonSeat: SeatNumber,
  seatedPlayers: PokerPlayerState[]
): { sbSeat: SeatNumber; bbSeat: SeatNumber } {
  const count = seatedPlayers.length;
  if (count < 2) {
    throw new Error("Cannot play poker with fewer than 2 seated players");
  }

  const sortedSeats = seatedPlayers.map((p) => p.seatNumber).sort((a, b) => a - b);
  const btnIdx = sortedSeats.indexOf(dealerButtonSeat);
  const effectiveBtnIdx = btnIdx >= 0 ? btnIdx : 0;

  if (count === 2) {
    // Heads-up: Button is Small Blind!
    const sbSeat = sortedSeats[effectiveBtnIdx]!;
    const bbSeat = sortedSeats[(effectiveBtnIdx + 1) % 2]!;
    return { sbSeat, bbSeat };
  }

  // 3+ players: SB is next seat clockwise from button, BB is next after SB
  const sbSeat = sortedSeats[(effectiveBtnIdx + 1) % count]!;
  const bbSeat = sortedSeats[(effectiveBtnIdx + 2) % count]!;
  return { sbSeat, bbSeat };
}

/** Determine who acts first on the current street. */
export function determineFirstToAct(
  street: "preflop" | "flop" | "turn" | "river",
  dealerButtonSeat: SeatNumber,
  sbSeat: SeatNumber,
  bbSeat: SeatNumber,
  players: Map<string, PokerPlayerState>
): string | null {
  const eligible = Array.from(players.values()).filter((p) => !p.hasFolded && !p.isAllIn);
  if (eligible.length <= 1) return null;

  const count = players.size;

  if (street === "preflop") {
    if (count === 2) {
      // Heads-up preflop: Button (SB) acts first!
      const sbPlayer = Array.from(players.values()).find((p) => p.seatNumber === sbSeat && !p.hasFolded && !p.isAllIn);
      if (sbPlayer) return sbPlayer.id;
    }
    // 3+ players preflop: Action starts after BB (Under the Gun / UTG)
    const order = getSeatedOrderAfter(bbSeat, players);
    const first = order.find((p) => !p.hasFolded && !p.isAllIn);
    return first ? first.id : null;
  }

  // Postflop: Action starts at the first active player clockwise from the button
  const order = getSeatedOrderAfter(dealerButtonSeat, players);
  const first = order.find((p) => !p.hasFolded && !p.isAllIn);
  return first ? first.id : null;
}

/** Get next active player clockwise who can act. */
export function getNextToAct(
  currentActPlayerId: string,
  players: Map<string, PokerPlayerState>
): string | null {
  const current = players.get(currentActPlayerId);
  if (!current) return null;

  const order = getSeatedOrderAfter(current.seatNumber, players);
  const next = order.find((p) => p.id !== currentActPlayerId && !p.hasFolded && !p.isAllIn);
  return next ? next.id : null;
}

/** Compute legal actions for a player given current street state. */
export function computeLegalActions(
  playerId: string,
  player: PokerPlayerState,
  currentBet: number,
  lastFullRaiseSize: number,
  bigBlind: number
): LegalActions {
  if (player.hasFolded || player.isAllIn) {
    return {
      canFold: false,
      canCheck: false,
      canCall: false,
      callAmount: 0,
      canBet: false,
      minBet: 0,
      maxBet: 0,
      canRaise: false,
      minRaiseTo: 0,
      maxRaiseTo: 0,
      canAllIn: false,
      allInAmount: 0,
    };
  }

  const toCall = currentBet - player.committedThisRound;
  const canCheck = toCall === 0;
  const canFold = true; // Player can always fold when facing action

  // Call
  const canCall = toCall > 0;
  const callAmount = Math.min(toCall, player.stack);

  // All-in is available whenever player has chips
  const canAllIn = player.stack > 0;
  const allInAmount = player.stack;

  // Bet (only when no current bet in this round)
  let canBet = false;
  let minBet = 0;
  let maxBet = 0;
  if (currentBet === 0) {
    minBet = Math.min(bigBlind, player.stack);
    maxBet = player.stack;
    canBet = player.stack >= minBet && player.stack > 0;
  }

  // Raise (when there is already a bet/raise)
  let canRaise = false;
  let minRaiseTo = 0;
  let maxRaiseTo = 0;
  if (currentBet > 0) {
    const minIncrement = Math.max(lastFullRaiseSize, bigBlind);
    const standardMinRaiseTo = currentBet + minIncrement;
    const maxPossibleRaiseTo = player.committedThisRound + player.stack;

    if (maxPossibleRaiseTo > currentBet) {
      canRaise = true;
      minRaiseTo = Math.min(standardMinRaiseTo, maxPossibleRaiseTo);
      maxRaiseTo = maxPossibleRaiseTo;
    }
  }

  return {
    canFold,
    canCheck,
    canCall,
    callAmount,
    canBet,
    minBet,
    maxBet,
    canRaise,
    minRaiseTo,
    maxRaiseTo,
    canAllIn,
    allInAmount,
  };
}

/**
 * Check if the betting round is complete:
 * 1. At least 1 player has not folded.
 * 2. Every active, non-all-in player has acted this round.
 * 3. Every active, non-all-in player has matched the current bet.
 */
export function isBettingRoundComplete(
  players: Map<string, PokerPlayerState>,
  currentBet: number
): boolean {
  const active = Array.from(players.values()).filter((p) => !p.hasFolded);

  // If ≤1 active player left, round and hand is finished
  if (active.length <= 1) return true;

  const canStillAct = active.filter((p) => !p.isAllIn);
  // If 0 or 1 player can still act and everyone matched, or 0 players can act (all all-in)
  if (canStillAct.length === 0) return true;

  return canStillAct.every(
    (p) => p.actedThisRound && p.committedThisRound === currentBet
  );
}
