import { DECK } from "../constants/timing.js";
import type { Card, Rank, Suit } from "../types/domain.js";

export const SUITS: readonly Suit[] = DECK.SUITS;
export const RANKS: readonly Rank[] = DECK.RANKS;

export const RANK_VALUES: Record<Rank, number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14, // Ace is high by default (14); wheel straight uses 1
};

export const RANK_NAMES: Record<Rank, string> = {
  "2": "Deuce",
  "3": "Three",
  "4": "Four",
  "5": "Five",
  "6": "Six",
  "7": "Seven",
  "8": "Eight",
  "9": "Nine",
  "10": "Ten",
  J: "Jack",
  Q: "Queen",
  K: "King",
  A: "Ace",
};

export const RANK_PLURALS: Record<Rank, string> = {
  "2": "Deuces",
  "3": "Threes",
  "4": "Fours",
  "5": "Fives",
  "6": "Sixes",
  "7": "Sevens",
  "8": "Eights",
  "9": "Nines",
  "10": "Tens",
  J: "Jacks",
  Q: "Queens",
  K: "Kings",
  A: "Aces",
};

/** Build a standard 52-card deck. */
export function buildDeck(): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({ rank, suit });
    }
  }
  return cards;
}

/** Secure Fisher-Yates shuffle with rejection sampling to eliminate modulo bias. */
export function shuffleDeck(deck: Card[] = buildDeck()): Card[] {
  const cards = [...deck];
  const randomBuffer = new Uint32Array(1);

  for (let i = cards.length - 1; i > 0; i--) {
    const range = i + 1;
    const maxAllowed = 0xffffffff - (0xffffffff % range);

    let rand: number;
    do {
      crypto.getRandomValues(randomBuffer);
      rand = randomBuffer[0]!;
    } while (rand >= maxAllowed);

    const j = rand % range;
    const temp = cards[i]!;
    cards[i] = cards[j]!;
    cards[j] = temp;
  }
  return cards;
}

/** Compare two cards by rank value (descending: highest first). */
export function compareCardsDesc(a: Card, b: Card): number {
  return RANK_VALUES[b.rank] - RANK_VALUES[a.rank];
}

/** Format a card as shorthand string (e.g., "A♠", "10♥"). */
export function formatCard(card: Card): string {
  const suitSymbols: Record<Suit, string> = {
    spades: "♠",
    hearts: "♥",
    diamonds: "♦",
    clubs: "♣",
  };
  return `${card.rank}${suitSymbols[card.suit]}`;
}

export function parseCard(str: string): Card {
  const rankPart = str.slice(0, -1);
  const suitChar = str.slice(-1);
  const suitMap: Record<string, Suit> = {
    s: "spades",
    "♠": "spades",
    h: "hearts",
    "♥": "hearts",
    d: "diamonds",
    "♦": "diamonds",
    c: "clubs",
    "♣": "clubs",
  };
  const suit = suitMap[suitChar.toLowerCase()];
  if (!suit) throw new Error(`Invalid suit char in "${str}"`);
  const rank = rankPart.toUpperCase() as Rank;
  if (!(rank in RANK_VALUES)) throw new Error(`Invalid rank in "${str}"`);
  return { rank, suit };
}
