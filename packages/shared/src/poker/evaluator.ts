import type { Card, Rank } from "../types/domain.js";
import { compareCardsDesc, RANK_NAMES, RANK_PLURALS, RANK_VALUES } from "./cards.js";

export type HandCategory =
  | "straight-flush"
  | "four-of-a-kind"
  | "full-house"
  | "flush"
  | "straight"
  | "three-of-a-kind"
  | "two-pair"
  | "one-pair"
  | "high-card";

export const CATEGORY_RANKS: Record<HandCategory, number> = {
  "straight-flush": 9,
  "four-of-a-kind": 8,
  "full-house": 7,
  flush: 6,
  straight: 5,
  "three-of-a-kind": 4,
  "two-pair": 3,
  "one-pair": 2,
  "high-card": 1,
};

export interface HandEvaluation {
  category: HandCategory;
  categoryScore: number;
  /**
   * Tie-break ranks in order of significance.
   * e.g., Full House K over 10: [13, 10]
   * Two Pair Aces and 8s with 5 kicker: [14, 8, 5]
   * Straight 9-high: [9]
   * Wheel straight (5-4-3-2-A): [5]
   */
  tieBreakers: number[];
  name: string;
  bestFiveCards: Card[];
}

/** Compare two HandEvaluations: > 0 if a wins, < 0 if b wins, 0 if tie. */
export function compareEvaluations(a: HandEvaluation, b: HandEvaluation): number {
  if (a.categoryScore !== b.categoryScore) {
    return a.categoryScore - b.categoryScore;
  }
  for (let i = 0; i < Math.max(a.tieBreakers.length, b.tieBreakers.length); i++) {
    const valA = a.tieBreakers[i] ?? 0;
    const valB = b.tieBreakers[i] ?? 0;
    if (valA !== valB) {
      return valA - valB;
    }
  }
  return 0;
}

/** Generate all combinations of k elements from an array. */
export function getCombinations<T>(array: T[], k: number): T[][] {
  const result: T[][] = [];
  function backtrack(start: number, current: T[]) {
    if (current.length === k) {
      result.push([...current]);
      return;
    }
    for (let i = start; i < array.length; i++) {
      current.push(array[i]!);
      backtrack(i + 1, current);
      current.pop();
    }
  }
  backtrack(0, []);
  return result;
}

/** Check if 5 sorted ranks (descending) form a straight. Returns high rank or null. */
function checkStraight(ranksDesc: number[]): { isStraight: boolean; highCard: number } {
  // Regular straight check
  let isNormal = true;
  for (let i = 0; i < 4; i++) {
    if (ranksDesc[i]! - ranksDesc[i + 1]! !== 1) {
      isNormal = false;
      break;
    }
  }
  if (isNormal) {
    return { isStraight: true, highCard: ranksDesc[0]! };
  }

  // Wheel straight check (A-5-4-3-2)
  // ranksDesc for Wheel: [14, 5, 4, 3, 2]
  if (
    ranksDesc[0] === 14 &&
    ranksDesc[1] === 5 &&
    ranksDesc[2] === 4 &&
    ranksDesc[3] === 3 &&
    ranksDesc[4] === 2
  ) {
    return { isStraight: true, highCard: 5 }; // 5-high straight
  }

  return { isStraight: false, highCard: 0 };
}

/** Evaluate exactly 5 cards. */
export function evaluate5CardHand(cards: Card[]): HandEvaluation {
  if (cards.length !== 5) {
    throw new Error(`evaluate5CardHand requires exactly 5 cards, got ${cards.length}`);
  }

  const sortedCards = [...cards].sort(compareCardsDesc);
  const ranksDesc = sortedCards.map((c) => RANK_VALUES[c.rank]);
  const isFlush = cards.every((c) => c.suit === cards[0]!.suit);

  const straightResult = checkStraight(ranksDesc);

  // Group by rank count
  const counts = new Map<number, { rank: Rank; val: number; count: number; cards: Card[] }>();
  for (const card of sortedCards) {
    const val = RANK_VALUES[card.rank];
    const existing = counts.get(val);
    if (existing) {
      existing.count++;
      existing.cards.push(card);
    } else {
      counts.set(val, { rank: card.rank, val, count: 1, cards: [card] });
    }
  }

  const groups = Array.from(counts.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.val - a.val;
  });

  // 1. Straight Flush / Royal Flush
  if (isFlush && straightResult.isStraight) {
    const high = straightResult.highCard;
    const isRoyal = high === 14;
    const name = isRoyal
      ? "Royal Flush"
      : high === 5
        ? "Straight Flush, Five high (The Wheel)"
        : `Straight Flush, ${RANK_NAMES[sortedCards[0]!.rank]} high`;

    // For wheel straight, order cards 5, 4, 3, 2, A
    let bestFive = sortedCards;
    if (high === 5) {
      bestFive = [sortedCards[1]!, sortedCards[2]!, sortedCards[3]!, sortedCards[4]!, sortedCards[0]!];
    }

    return {
      category: "straight-flush",
      categoryScore: CATEGORY_RANKS["straight-flush"],
      tieBreakers: [high],
      name,
      bestFiveCards: bestFive,
    };
  }

  // 2. Four of a Kind
  if (groups[0]!.count === 4) {
    const quadRank = groups[0]!.val;
    const kicker = groups[1]!.val;
    const quadName = RANK_PLURALS[groups[0]!.rank];
    const kickerName = RANK_NAMES[groups[1]!.rank];
    return {
      category: "four-of-a-kind",
      categoryScore: CATEGORY_RANKS["four-of-a-kind"],
      tieBreakers: [quadRank, kicker],
      name: `Four of a Kind, ${quadName} (${kickerName} kicker)`,
      bestFiveCards: [...groups[0]!.cards, ...groups[1]!.cards],
    };
  }

  // 3. Full House
  if (groups[0]!.count === 3 && groups[1]!.count === 2) {
    const tripRank = groups[0]!.val;
    const pairRank = groups[1]!.val;
    const tripName = RANK_PLURALS[groups[0]!.rank];
    const pairName = RANK_PLURALS[groups[1]!.rank];
    return {
      category: "full-house",
      categoryScore: CATEGORY_RANKS["full-house"],
      tieBreakers: [tripRank, pairRank],
      name: `Full House, ${tripName} full of ${pairName}`,
      bestFiveCards: [...groups[0]!.cards, ...groups[1]!.cards],
    };
  }

  // 4. Flush
  if (isFlush) {
    const highName = RANK_NAMES[sortedCards[0]!.rank];
    return {
      category: "flush",
      categoryScore: CATEGORY_RANKS.flush,
      tieBreakers: ranksDesc,
      name: `Flush, ${highName} high`,
      bestFiveCards: sortedCards,
    };
  }

  // 5. Straight
  if (straightResult.isStraight) {
    const high = straightResult.highCard;
    const highName = high === 5 ? "Five" : RANK_NAMES[sortedCards[0]!.rank];
    const name = high === 5 ? "Straight, Five high (The Wheel)" : `Straight, ${highName} high`;

    let bestFive = sortedCards;
    if (high === 5) {
      bestFive = [sortedCards[1]!, sortedCards[2]!, sortedCards[3]!, sortedCards[4]!, sortedCards[0]!];
    }

    return {
      category: "straight",
      categoryScore: CATEGORY_RANKS.straight,
      tieBreakers: [high],
      name,
      bestFiveCards: bestFive,
    };
  }

  // 6. Three of a Kind
  if (groups[0]!.count === 3) {
    const tripRank = groups[0]!.val;
    const kickers = [groups[1]!.val, groups[2]!.val];
    const tripName = RANK_PLURALS[groups[0]!.rank];
    return {
      category: "three-of-a-kind",
      categoryScore: CATEGORY_RANKS["three-of-a-kind"],
      tieBreakers: [tripRank, ...kickers],
      name: `Three of a Kind, ${tripName}`,
      bestFiveCards: [...groups[0]!.cards, groups[1]!.cards[0]!, groups[2]!.cards[0]!],
    };
  }

  // 7. Two Pair
  if (groups[0]!.count === 2 && groups[1]!.count === 2) {
    const highPair = groups[0]!.val;
    const lowPair = groups[1]!.val;
    const kicker = groups[2]!.val;
    const highName = RANK_PLURALS[groups[0]!.rank];
    const lowName = RANK_PLURALS[groups[1]!.rank];
    const kickerName = RANK_NAMES[groups[2]!.rank];
    return {
      category: "two-pair",
      categoryScore: CATEGORY_RANKS["two-pair"],
      tieBreakers: [highPair, lowPair, kicker],
      name: `Two Pair, ${highName} and ${lowName} (${kickerName} kicker)`,
      bestFiveCards: [...groups[0]!.cards, ...groups[1]!.cards, groups[2]!.cards[0]!],
    };
  }

  // 8. One Pair
  if (groups[0]!.count === 2) {
    const pairRank = groups[0]!.val;
    const kickers = [groups[1]!.val, groups[2]!.val, groups[3]!.val];
    const pairName = RANK_PLURALS[groups[0]!.rank];
    return {
      category: "one-pair",
      categoryScore: CATEGORY_RANKS["one-pair"],
      tieBreakers: [pairRank, ...kickers],
      name: `Pair of ${pairName}`,
      bestFiveCards: [
        ...groups[0]!.cards,
        groups[1]!.cards[0]!,
        groups[2]!.cards[0]!,
        groups[3]!.cards[0]!,
      ],
    };
  }

  // 9. High Card
  const highName = RANK_NAMES[sortedCards[0]!.rank];
  return {
    category: "high-card",
    categoryScore: CATEGORY_RANKS["high-card"],
    tieBreakers: ranksDesc,
    name: `${highName} High`,
    bestFiveCards: sortedCards,
  };
}

/**
 * Evaluate the best 5-card hand out of 5, 6, or 7 cards.
 * Tests all combinations and returns the highest-scoring HandEvaluation.
 */
export function evaluateBestHand(cards: Card[]): HandEvaluation {
  if (cards.length < 5) {
    throw new Error(`Cannot evaluate poker hand with fewer than 5 cards (got ${cards.length})`);
  }
  if (cards.length === 5) {
    return evaluate5CardHand(cards);
  }

  const combos = getCombinations(cards, 5);
  let bestEval: HandEvaluation | null = null;

  for (const combo of combos) {
    const current = evaluate5CardHand(combo);
    if (!bestEval || compareEvaluations(current, bestEval) > 0) {
      bestEval = current;
    }
  }

  return bestEval!;
}

/** Compare two sets of cards (e.g. player hand vs player hand with community cards). */
export function comparePlayerHands(cardsA: Card[], cardsB: Card[]): number {
  const evalA = evaluateBestHand(cardsA);
  const evalB = evaluateBestHand(cardsB);
  return compareEvaluations(evalA, evalB);
}
