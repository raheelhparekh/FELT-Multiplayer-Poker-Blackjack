import { describe, expect, it } from "vitest";
import { defaultRoomConfig } from "../../types/config.js";
import { buildShoe, drawCard, shoeSize } from "../shoe.js";

describe("Shoe — Phase 0 smoke tests", () => {
  const cfg = defaultRoomConfig();

  it("builds a shoe with the correct number of cards", () => {
    const shoe = buildShoe(cfg.decks, cfg.penetration);
    expect(shoeSize(shoe)).toBe(cfg.decks * 52);
  });

  it("drawing a card reduces shoe size by 1", () => {
    const shoe = buildShoe(1, 0.75);
    const before = shoeSize(shoe);
    const { shoe: after } = drawCard(shoe);
    expect(shoeSize(after)).toBe(before - 1);
  });

  it("marks cut card passed at ~75% penetration by default", () => {
    let shoe = buildShoe(1, 0.75); // 52 cards; cut at 39
    const cutAt = shoe.cutCardPosition; // 39
    for (let i = 0; i < cutAt; i++) {
      expect(shoe.cutCardPassed).toBe(false);
      ({ shoe } = drawCard(shoe));
    }
    expect(shoe.cutCardPassed).toBe(true);
  });

  it("shoe cards are shuffled (extremely unlikely to be in order)", () => {
    const shoe1 = buildShoe(1, 0.75);
    const shoe2 = buildShoe(1, 0.75);
    // Two independently shuffled shoes should differ (probability of same order: 1/52!)
    const same = shoe1.cards.every(
      (c, i) => c.rank === shoe2.cards[i]?.rank && c.suit === shoe2.cards[i]?.suit,
    );
    expect(same).toBe(false);
  });
});
