import { DECK } from "../constants/index.js";
import type { Card, Rank, Suit } from "../types/index.js";

/** Universal cryptographically secure random integer in [min, max). */
function secureRandomInt(min: number, max: number): number {
  const range = max - min;
  if (range <= 0) return min;
  if (typeof globalThis !== "undefined" && globalThis.crypto?.getRandomValues) {
    const uint32 = new Uint32Array(1);
    const maxUint32 = 0xffffffff;
    const limit = maxUint32 - (maxUint32 % range);
    let rand: number;
    do {
      globalThis.crypto.getRandomValues(uint32);

      rand = uint32[0]!;
    } while (rand >= limit);
    return min + (rand % range);
  }
  return min + Math.floor(Math.random() * range);
}

/** A shoe holds all undealt cards plus bookkeeping for the cut card. */
export interface Shoe {
  /** All cards (dealt cards are removed from the front). */
  cards: Card[];
  /** Total cards the shoe started with (decks × 52). */
  totalCards: number;
  /** Index (into original total) at which the cut card sits. */
  cutCardPosition: number;
  /** Whether the cut card has been passed — triggers reshuffle after the round. */
  cutCardPassed: boolean;
}

/** Build and shuffle a fresh shoe of `decks` decks. */
export function buildShoe(decks: number, penetration: number): Shoe {
  const cards = buildUnshuffledCards(decks);
  fisherYatesShuffle(cards);
  const totalCards = cards.length;
  const cutCardPosition = Math.floor(totalCards * penetration);
  return { cards, totalCards, cutCardPosition, cutCardPassed: false };
}

/** Draw one card from the front of the shoe. Returns the card and a new Shoe. */
export function drawCard(shoe: Shoe): { card: Card; shoe: Shoe } {
  if (shoe.cards.length === 0) {
    throw new Error("Shoe is empty — should have reshuffled.");
  }
  // Safe: we checked length above
  const card = shoe.cards[0] as Card;
  const remaining = shoe.cards.slice(1);
  const dealtCount = shoe.totalCards - remaining.length;
  const cutCardPassed = shoe.cutCardPassed || dealtCount >= shoe.cutCardPosition;
  return {
    card,
    shoe: { ...shoe, cards: remaining, cutCardPassed },
  };
}

/** How many cards remain in the shoe. */
export function shoeSize(shoe: Shoe): number {
  return shoe.cards.length;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildUnshuffledCards(decks: number): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < decks; d++) {
    for (const suit of DECK.SUITS) {
      for (const rank of DECK.RANKS) {
        cards.push({ suit: suit as Suit, rank: rank as Rank });
      }
    }
  }
  return cards;
}

/**
 * In-place Fisher–Yates shuffle using crypto.randomInt for unbiased randomness.
 * Never uses Math.random.
 */
export function fisherYatesShuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = secureRandomInt(0, i + 1);

    const tmp = arr[i]!;

    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}
