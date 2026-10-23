import type { Card, SeatNumber } from "../types/domain.js";
import { compareEvaluations, evaluateBestHand } from "./evaluator.js";
import type { HandWinner, PokerPlayerState, Pot } from "./state.js";

export interface Contributor {
  playerId: string;
  totalCommitted: number;
  hasFolded: boolean;
  isAllIn: boolean;
  seatNumber: SeatNumber;
}

/**
 * Build main pot and side pots from player contributions across the hand.
 *
 * Each pot has:
 *  - `amount`: total chips in this pot tier
 *  - `eligiblePlayerIds`: active (non-folded) players who contributed at least up to this tier
 */
export function calculateSidePots(contributors: Contributor[]): Pot[] {
  const activeContributors = contributors.filter((c) => c.totalCommitted > 0);
  if (activeContributors.length === 0) {
    return [];
  }

  // Find all distinct non-zero contribution amounts of all-in players
  const allInCaps = Array.from(
    new Set(
      activeContributors
        .filter((c) => c.isAllIn)
        .map((c) => c.totalCommitted)
    )
  ).sort((a, b) => a - b);

  // If no one is all-in, all contributions form a single pot
  if (allInCaps.length === 0) {
    const total = activeContributors.reduce((sum, c) => sum + c.totalCommitted, 0);
    const eligible = activeContributors.filter((c) => !c.hasFolded).map((c) => c.playerId);
    return [{ amount: total, eligiblePlayerIds: eligible }];
  }

  // There are all-in caps. Create tiered pots.
  const tiers: number[] = [];
  let prevCap = 0;
  for (const cap of allInCaps) {
    if (cap > prevCap) {
      tiers.push(cap);
      prevCap = cap;
    }
  }

  // Check if any non-all-in player committed more than the highest all-in cap
  const maxCommit = Math.max(...activeContributors.map((c) => c.totalCommitted));
  if (maxCommit > prevCap) {
    tiers.push(maxCommit);
  }

  const pots: Pot[] = [];
  let lowerBound = 0;

  for (const tierCap of tiers) {
    const tierSize = tierCap - lowerBound;
    let potAmount = 0;
    const eligible: string[] = [];

    for (const c of activeContributors) {
      if (c.totalCommitted > lowerBound) {
        const contributionInTier = Math.min(c.totalCommitted - lowerBound, tierSize);
        potAmount += contributionInTier;
        if (!c.hasFolded && c.totalCommitted >= tierCap) {
          eligible.push(c.playerId);
        }
      }
    }

    if (potAmount > 0) {
      pots.push({
        amount: potAmount,
        eligiblePlayerIds: eligible,
      });
    }

    lowerBound = tierCap;
  }

  return pots;
}

/**
 * Award pots to the best hands.
 * If multiple eligible players tie, split the pot evenly.
 * Distribute odd chips clockwise starting from the button seat + 1 (small blind position).
 */
export function resolvePots(
  pots: Pot[],
  players: Map<string, PokerPlayerState>,
  communityCards: Card[],
  dealerButtonSeat: SeatNumber,
  chipUnit: number = 25
): HandWinner[] {
  const winners: HandWinner[] = [];

  // Determine clockwise seat order starting from button + 1
  const allSeats: SeatNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const sortedSeatsClockwise = [
    ...allSeats.filter((s) => s > dealerButtonSeat),
    ...allSeats.filter((s) => s <= dealerButtonSeat),
  ];

  for (let potIndex = 0; potIndex < pots.length; potIndex++) {
    const pot = pots[potIndex]!;
    if (pot.amount <= 0 || pot.eligiblePlayerIds.length === 0) continue;

    // Evaluate each eligible player's hand
    const evaluations = pot.eligiblePlayerIds.map((pid) => {
      const p = players.get(pid)!;
      const all7 = [...p.holeCards, ...communityCards];
      const ev = evaluateBestHand(all7);
      return {
        playerId: pid,
        seatNumber: p.seatNumber,
        evaluation: ev,
      };
    });

    // Find the best evaluation
    let bestEval = evaluations[0]!;
    for (let i = 1; i < evaluations.length; i++) {
      if (compareEvaluations(evaluations[i]!.evaluation, bestEval.evaluation) > 0) {
        bestEval = evaluations[i]!;
      }
    }

    // Find all tying winners
    const tyingWinners = evaluations.filter(
      (e) => compareEvaluations(e.evaluation, bestEval.evaluation) === 0
    );

    // If single winner, award entire pot amount directly (100% chip conservation)
    if (tyingWinners.length === 1) {
      const soleWinner = tyingWinners[0]!;
      winners.push({
        playerId: soleWinner.playerId,
        potIndex,
        amount: pot.amount,
        handName: soleWinner.evaluation.name,
        evaluation: soleWinner.evaluation,
      });
      continue;
    }

    const share = Math.floor(pot.amount / tyingWinners.length / chipUnit) * chipUnit;
    let remainder = pot.amount - share * tyingWinners.length;

    // Distribute remainder (odd chips) 1 chipUnit at a time clockwise from button+1
    const orderedWinners = [...tyingWinners].sort((a, b) => {
      const idxA = sortedSeatsClockwise.indexOf(a.seatNumber);
      const idxB = sortedSeatsClockwise.indexOf(b.seatNumber);
      return idxA - idxB;
    });

    const payouts = new Array(orderedWinners.length).fill(share);
    let idx = 0;
    while (remainder >= chipUnit) {
      payouts[idx % orderedWinners.length] += chipUnit;
      remainder -= chipUnit;
      idx++;
    }
    // Any remaining odd chips (< chipUnit) must still be conserved and awarded clockwise
    if (remainder > 0) {
      payouts[0] += remainder;
      remainder = 0;
    }

    for (let i = 0; i < orderedWinners.length; i++) {
      const w = orderedWinners[i]!;
      winners.push({
        playerId: w.playerId,
        potIndex,
        amount: payouts[i]!,
        handName: w.evaluation.name,
        evaluation: w.evaluation,
      });
    }
  }

  return winners;
}
