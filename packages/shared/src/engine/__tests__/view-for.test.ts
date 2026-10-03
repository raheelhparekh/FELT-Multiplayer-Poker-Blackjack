/**
 * Hidden-information tests (P0 requirement from Brief §9).
 *
 * Verifies that viewFor() never exposes:
 * - The dealer's hole card before the reveal
 * - The shoe contents
 * - dealerHasBlackjack flag
 */
import { describe, expect, it } from "vitest";
import { defaultRoomConfig } from "../../types/config.js";
import type { Card, SeatNumber } from "../../types/index.js";
import { createHand, createInitialState } from "../factory.js";
import { buildShoe } from "../shoe.js";
import type { GameState } from "../state.js";
import { scanForLeaks, viewFor } from "../view-for.js";

const c = (rank: Card["rank"], suit: Card["suit"] = "spades"): Card => ({ rank, suit });

function stateWithDealerHand(phase: GameState["phase"] = "player_turns"): GameState {
  const cfg = defaultRoomConfig();
  const s = createInitialState("LEAK_TEST", cfg);
  const shoe = buildShoe(cfg.decks, cfg.penetration);

  const playerHand = { ...createHand("h1", "p1", 1 as SeatNumber, 100), cards: [c("10"), c("7")] };
  const dealerHand = {
    ...createHand("dh1", "dealer", 1 as SeatNumber, 0),
    cards: [c("A"), c("K")],
  };

  return {
    ...s,
    shoe,
    phase,
    hands: [playerHand],
    dealerHand,
    activeHandId: "h1",
    seatedPlayers: new Map([[1 as SeatNumber, "p1"]]),
    stacks: new Map([["p1", 900]]),
    dealerHasBlackjack: true, // Server-side only — must NEVER leak
  };
}

describe("viewFor — hidden-information (P0)", () => {
  const PRE_REVEAL_PHASES: GameState["phase"][] = [
    "betting",
    "dealing",
    "insurance",
    "peek",
    "player_turns",
  ];
  const POST_REVEAL_PHASES: GameState["phase"][] = ["dealer_turn", "settlement", "round_summary"];

  it("hole card is hidden in all pre-reveal phases for a player viewer", () => {
    for (const phase of PRE_REVEAL_PHASES) {
      const state = stateWithDealerHand(phase);
      const view = viewFor(state, "p1");
      const holeSlot = view.dealerHand?.cards[1];
      expect(holeSlot?.hidden, `Hole card visible in phase '${phase}' for player`).toBe(true);
    }
  });

  it("hole card is hidden in all pre-reveal phases for the DEALER viewer", () => {
    for (const phase of PRE_REVEAL_PHASES) {
      const state = stateWithDealerHand(phase);
      const view = viewFor(state, "dealer");
      const holeSlot = view.dealerHand?.cards[1];
      expect(holeSlot?.hidden, `Hole card visible in phase '${phase}' for dealer`).toBe(true);
    }
  });

  it("hole card is hidden for spectator viewer", () => {
    const state = stateWithDealerHand("player_turns");
    const view = viewFor(state, "spectator_x");
    expect(view.dealerHand?.cards[1]?.hidden).toBe(true);
  });

  it("hole card is revealed in dealer_turn", () => {
    const state = stateWithDealerHand("dealer_turn");
    const view = viewFor(state, "p1");
    const holeSlot = view.dealerHand?.cards[1];
    expect(holeSlot?.hidden).toBe(false);
  });

  it("hole card is revealed in round_summary", () => {
    const state = stateWithDealerHand("round_summary");
    const view = viewFor(state, "p1");
    expect(view.dealerHand?.cards[1]?.hidden).toBe(false);
  });

  it("dealerHasBlackjack is NEVER present in any view", () => {
    for (const phase of [...PRE_REVEAL_PHASES, ...POST_REVEAL_PHASES]) {
      const state = stateWithDealerHand(phase);
      const view = viewFor(state, "p1");
      const serialized = JSON.stringify(view);
      expect(
        serialized.includes("dealerHasBlackjack"),
        `dealerHasBlackjack leaked in phase '${phase}'`,
      ).toBe(false);
    }
  });

  it("shoe contents are NEVER serialised in any view", () => {
    for (const phase of [...PRE_REVEAL_PHASES, ...POST_REVEAL_PHASES]) {
      const state = stateWithDealerHand(phase);
      const view = viewFor(state, "p1");
      // The view should not have a 'shoe' or 'cards' key at the top level
      expect("shoe" in view).toBe(false);
      // Serialized view should not contain the shoe's card list
      const serialized = JSON.stringify(view);
      expect(serialized.includes('"cutCardPosition"')).toBe(false);
    }
  });

  it("scanForLeaks returns no violations for pre-reveal player view", () => {
    const state = stateWithDealerHand("player_turns");
    const view = viewFor(state, "p1");
    const violations = scanForLeaks(view, state);
    expect(violations).toHaveLength(0);
  });

  it("scanForLeaks detects a tampered view with exposed hole card", () => {
    const state = stateWithDealerHand("player_turns");
    const view = viewFor(state, "p1");

    // Tamper: force the hole card to be visible
    const tamperedView = {
      ...view,
      dealerHand: {
        ...view.dealerHand!,
        cards: [
          view.dealerHand!.cards[0]!,
          { hidden: false, card: c("K") }, // LEAK
        ],
      },
    };

    const violations = scanForLeaks(tamperedView, state);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toMatch(/hole card/i);
  });

  it("player hands are fully visible to all viewers", () => {
    const state = stateWithDealerHand("player_turns");

    for (const viewerId of ["p1", "dealer", "spectator_x"]) {
      const view = viewFor(state, viewerId);
      expect(view.hands).toHaveLength(1);
      const hand = view.hands[0]!;
      expect(hand.cards[0]?.hidden).toBe(false);
      expect(hand.cards[1]?.hidden).toBe(false);
    }
  });
});
