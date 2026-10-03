import type { Card } from "../types/index.js";

/** Result of evaluating a hand. */
export interface HandValue {
  /** Best non-busting total (or the lowest bust total if all options bust). */
  total: number;
  /** True when an ace is counted as 11 in the current total. */
  isSoft: boolean;
  /** True when total > 21. */
  isBust: boolean;
  /** True when exactly two cards with total == 21. Only meaningful on first two cards. */
  isBlackjack: boolean;
}

/** Numeric pip value of a rank (Ace = 1 here; we handle the 11 case in the loop). */
function pipValue(rank: Card["rank"]): number {
  if (rank === "A") return 11; // start optimistic; we subtract 10 if needed
  if (rank === "J" || rank === "Q" || rank === "K") return 10;
  return Number(rank);
}

/**
 * Evaluate a hand of cards.
 * Aces are counted as 11 until the hand busts, then each ace is reduced to 1.
 */
export function evaluateHand(cards: Card[]): HandValue {
  let total = 0;
  let aces = 0;

  for (const card of cards) {
    if (card.rank === "A") aces++;
    total += pipValue(card.rank);
  }

  // Reduce aces from 11 → 1 until we're ≤ 21
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }

  const isSoft = aces > 0 && total <= 21;
  const isBust = total > 21;
  const isBlackjack = cards.length === 2 && total === 21;

  return { total, isSoft, isBust, isBlackjack };
}

/**
 * Human-readable total string.
 * Soft hands show as "7/17"; hard hands show as "17".
 */
export function formatHandValue(hv: HandValue): string {
  if (hv.isSoft) {
    return `${hv.total - 10}/${hv.total}`;
  }
  return String(hv.total);
}

/** Whether two cards can be split (by value). */
export function canSplitByValue(a: Card, b: Card): boolean {
  return pipValue(a.rank) === pipValue(b.rank);
}

/** Whether two cards can be split (by rank — stricter). */
export function canSplitByRank(a: Card, b: Card): boolean {
  return a.rank === b.rank;
}
