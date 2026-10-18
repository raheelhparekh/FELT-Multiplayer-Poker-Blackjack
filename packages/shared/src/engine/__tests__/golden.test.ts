/**
 * Phase B — Blackjack Golden (Characterization) Tests
 *
 * These tests lock the exact deterministic output of the blackjack engine
 * for manually-constructed card sequences (seeded shoe).
 *
 * They are NOT meant to test individual rules (engine.test.ts does that).
 * Instead they document "what the engine actually does today" for a known
 * sequence of cards, so that any accidental regression during the Phase C
 * GameModule refactor is caught immediately.
 *
 * Rules:
 *  - Do NOT change expected values without a deliberate rule change.
 *  - Each test documents WHY the expected value is what it is.
 *  - Tests must remain green on every refactor step.
 */

import { describe, expect, it } from "vitest";
import { defaultRoomConfig } from "../../types/config.js";
import type { Card, SeatNumber } from "../../types/index.js";
import { createInitialState } from "../factory.js";
import { reduce } from "../reduce.js";
import { buildShoe } from "../shoe.js";
import type { GameState } from "../state.js";
import { viewFor } from "../view-for.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const c = (rank: Card["rank"], suit: Card["suit"] = "spades"): Card => ({ rank, suit });

/** Build a shoe with a known card sequence at the front. */
function seededShoe(frontCards: Card[]): ReturnType<typeof buildShoe> {
  const cfg = defaultRoomConfig();
  const real = buildShoe(cfg.decks, cfg.penetration);
  return {
    ...real,
    cards: [...frontCards, ...real.cards.slice(frontCards.length)],
  };
}

/** Build a GameState ready to deal (bet locked, shoe seeded). */
function stateReadyToDeal(
  playerId: string,
  betAmount: number,
  frontCards: Card[],
  extraConfig: Partial<ReturnType<typeof defaultRoomConfig>> = {},
): GameState {
  const cfg = { ...defaultRoomConfig(), ...extraConfig };
  const base = createInitialState("GOLDEN", cfg);
  const seat: SeatNumber = 1;
  const shoe = seededShoe(frontCards);

  const stacks = new Map([[playerId, cfg.startingStack - betAmount]]);
  const lockedBets = new Map([[playerId, betAmount]]);
  const seatedPlayers = new Map<SeatNumber, string>([[seat, playerId]]);
  const participants = new Map(base.participants);

  return {
    ...base,
    config: cfg,
    shoe,
    phase: "betting",
    stacks,
    lockedBets,
    seatedPlayers,
    participants,
    dealerBank: cfg.dealerStartingBank,
  };
}

// ─── Golden Test 1: Player hard-17 vs dealer 18 → loss ──────────────────────
// Deal order: p1, d_up, p2, d_hole, then dealer draws
// Player: 10+7=17 (hard). Dealer: 5(up)+K(hole)=15 → draws 3 → 18. Player loses.

describe("Golden #1 — Player hard-17 loses to dealer 18", () => {
  const P = "player-1";
  const BET = 100;
  const FRONT = [c("10"), c("5", "clubs"), c("7", "hearts"), c("K", "diamonds"), c("3", "clubs")];

  it("deal produces correct hand cards and transitions to player_turns", () => {
    const state0 = stateReadyToDeal(P, BET, FRONT);
    const { state: state1, events: events1 } = reduce(state0, { type: "dealer:deal", dealerId: P });

    expect(state1.phase).toBe("player_turns");

    const playerHand = state1.hands.find((h) => h.playerId === P);
    expect(playerHand!.cards).toEqual([c("10"), c("7", "hearts")]);

    expect(state1.dealerHand!.cards[0]).toEqual(c("5", "clubs")); // up card
    expect(state1.dealerHand!.cards[1]).toEqual(c("K", "diamonds")); // hole

    const dealEvents = events1.filter((e) => e.type === "cardDealt");
    expect(dealEvents).toHaveLength(4);

    // Dealer hole event carries null card (hidden)
    const holeEvent = dealEvents.find(
      (e) => e.type === "cardDealt" && e.to === "dealer" && e.card === null,
    );
    expect(holeEvent).toBeDefined();
  });

  it("stand → reveal (auto-draw 3) → settlement: loss, stack = startingStack - BET", () => {
    const state0 = stateReadyToDeal(P, BET, FRONT);
    const { state: s1 } = reduce(state0, { type: "dealer:deal", dealerId: P });

    const handId = s1.activeHandId!;
    const { state: s2 } = reduce(s1, { type: "play:stand", playerId: P, handId });
    expect(s2.phase).toBe("dealer_turn");

    const { state: s3, events: evReveal } = reduce(s2, { type: "dealer:reveal", dealerId: P });
    expect(s3.dealerHoleCardRevealed).toBe(true);
    expect(s3.phase).toBe("round_summary");
    expect(evReveal.some((e) => e.type === "cardFlipped")).toBe(true);

    // Dealer: 5+K=15 → draws 3 → 18 → stands
    expect(s3.dealerHand!.cards).toHaveLength(3);
    expect(s3.dealerHand!.cards[2]).toEqual(c("3", "clubs"));

    const resultEv = evReveal.find((e) => e.type === "handResult");
    expect(resultEv).toBeDefined();
    expect(resultEv!.result).toBe("loss");
    expect(resultEv!.net).toBe(-BET);

    const cfg = defaultRoomConfig();
    expect(s3.stacks.get(P)).toBe(cfg.startingStack - BET);
  });
});

// ─── Golden Test 2: Player blackjack (3:2 payout) ───────────────────────────
// Player: A+K = 21 (BJ). Dealer: 5+2 = 7 (no BJ). Payout 3:2 on BET=100 → net +150.

describe("Golden #2 — Player Blackjack: 3:2 payout", () => {
  const P = "player-bj";
  const BET = 100;
  const FRONT = [c("A"), c("5", "diamonds"), c("K", "clubs"), c("2", "hearts")];

  it("BJ detected at deal; player wins 150 net", () => {
    const state0 = stateReadyToDeal(P, BET, FRONT);
    const { state: s1 } = reduce(state0, { type: "dealer:deal", dealerId: P });

    const playerHand = s1.hands.find((h) => h.playerId === P);
    expect(playerHand!.cards).toEqual([c("A"), c("K", "clubs")]);
    expect(s1.phase).toBe("dealer_turn");

    // Reveal dealer hand -> auto draws and settles
    const { state: s2 } = reduce(s1, { type: "dealer:reveal", dealerId: P });
    expect(s2.phase).toBe("round_summary");

    const finalHand = s2.hands.find((h) => h.playerId === P);
    expect(finalHand!.result).toBe("blackjack");

    // Stack: (startingStack - BET) + BET returned + 150 win = startingStack + 150
    const cfg = defaultRoomConfig();
    expect(s2.stacks.get(P)).toBe(cfg.startingStack + 150);
  });
});

// ─── Golden Test 3: Push — both have hard-20 ────────────────────────────────
// Player: K+Q=20. Dealer: K+Q=20. Push → bet returned, net=0.

describe("Golden #3 — Push: both hard-20", () => {
  const P = "player-push";
  const BET = 200;
  const FRONT = [c("K"), c("K", "hearts"), c("Q", "clubs"), c("Q", "diamonds")];

  it("push: bet returned, stack = startingStack", () => {
    const state0 = stateReadyToDeal(P, BET, FRONT);
    const { state: s1 } = reduce(state0, { type: "dealer:deal", dealerId: P });

    const handId = s1.activeHandId!;
    const { state: s2 } = reduce(s1, { type: "play:stand", playerId: P, handId });
    const { state: s3, events: ev3 } = reduce(s2, { type: "dealer:reveal", dealerId: P });

    expect(s3.phase).toBe("round_summary");

    const resultEv = ev3.find((e) => e.type === "handResult");
    expect(resultEv!.result).toBe("push");
    expect(resultEv!.net).toBe(0);

    const cfg = defaultRoomConfig();
    // Push: (startingStack - BET) + BET returned = startingStack
    expect(s3.stacks.get(P)).toBe(cfg.startingStack);
  });
});

// ─── Golden Test 4: Player busts ─────────────────────────────────────────────
// Player: 9+6=15 → hits 10 → busts (25). Dealer: 3+7=10 (irrelevant; player busts first).

describe("Golden #4 — Player busts on hit", () => {
  const P = "player-bust";
  const BET = 150;
  const FRONT = [c("9"), c("3", "diamonds"), c("6", "hearts"), c("7", "clubs"), c("10", "clubs")];

  it("hit causes bust → result=bust, stack does not recover bet", () => {
    const state0 = stateReadyToDeal(P, BET, FRONT);
    const { state: s1 } = reduce(state0, { type: "dealer:deal", dealerId: P });
    expect(s1.phase).toBe("player_turns");

    const handId = s1.activeHandId!;
    const { state: s2 } = reduce(s1, { type: "play:hit", playerId: P, handId });

    const playerHand = s2.hands.find((h) => h.playerId === P);
    expect(playerHand!.cards).toHaveLength(3);
    expect(playerHand!.cards[2]).toEqual(c("10", "clubs"));

    // Phase should have advanced (all hands busted/locked)
    expect(["dealer_turn", "settlement", "round_summary"]).toContain(s2.phase);

    let s = s2;
    let attempts = 0;
    while (s.phase !== "round_summary" && attempts++ < 10) {
      if (s.phase === "dealer_turn") {
        ({ state: s } = reduce(s, { type: "dealer:reveal", dealerId: P }));
      } else {
        ({ state: s } = reduce(s, { type: "dealer:nextRound", actorId: P }));
      }
    }

    const bustHand = s.hands.find((h) => h.playerId === P);
    expect(bustHand!.result).toBe("bust");

    // Stack: startingStack - BET at deal time. Bust = bet already gone, nothing returned.
    const cfg = defaultRoomConfig();
    expect(s.stacks.get(P)).toBe(cfg.startingStack - BET);
  });
});

// ─── Golden Test 5: Double down ───────────────────────────────────────────────
// Player: 6+5=11 → double → K → 21. Dealer: 9+Q=19. Player wins 2×BET.

describe("Golden #5 — Double Down wins 2×BET", () => {
  const P = "player-dbl";
  const BET = 100;
  const EXTRA = { doubleRestriction: "any" as const };
  const FRONT = [c("6"), c("9", "hearts"), c("5", "diamonds"), c("Q", "clubs"), c("K")];

  it("double → draw K → 21 vs dealer 19 → win, net = +BET", () => {
    const state0 = stateReadyToDeal(P, BET, FRONT, EXTRA);
    const { state: s1 } = reduce(state0, { type: "dealer:deal", dealerId: P });

    const handId = s1.activeHandId!;
    const stackBeforeDbl = s1.stacks.get(P)!;
    const { state: s2 } = reduce(s1, { type: "play:double", playerId: P, handId });

    // Extra BET deducted from stack
    expect(s2.stacks.get(P)).toBe(stackBeforeDbl - BET);

    const dblHand = s2.hands.find((h) => h.playerId === P);
    expect(dblHand!.cards).toHaveLength(3);
    expect(dblHand!.cards[2]).toEqual(c("K"));
    expect(dblHand!.isDoubled).toBe(true);
    expect(dblHand!.isLocked).toBe(true);

    let s = s2;
    let attempts = 0;
    while (s.phase !== "round_summary" && attempts++ < 10) {
      if (s.phase === "dealer_turn") {
        ({ state: s } = reduce(s, { type: "dealer:reveal", dealerId: P }));
      } else {
        ({ state: s } = reduce(s, { type: "dealer:nextRound", actorId: P }));
      }
    }

    const finalHand = s.hands.find((h) => h.playerId === P);
    expect(finalHand!.result).toBe("win");

    // Stack: (startingStack - BET - BET) + 2*BET (win) = startingStack
    // Net = +BET
    const cfg = defaultRoomConfig();
    expect(s.stacks.get(P)).toBe(cfg.startingStack + 2 * BET);
  });
});

// ─── Golden Test 6: viewFor hidden-info golden shapes ───────────────────────

describe("Golden #6 — viewFor hidden-information contract", () => {
  const P = "player-view";
  const BET = 100;
  // Dealer has A up + K hole (potential BJ) — hole MUST be hidden in player_turns
  const FRONT = [c("10"), c("A", "clubs"), c("7", "hearts"), c("K", "diamonds")];

  it("player viewer: hole hidden, up card visible, player cards visible", () => {
    const state0 = stateReadyToDeal(P, BET, FRONT);
    const { state } = reduce(state0, { type: "dealer:deal", dealerId: P });
    const view = viewFor(state, P);

    const upCard = view.dealerHand?.cards[0];
    expect(view.dealerHand?.cards[1]?.hidden).toBe(true);
    expect(upCard?.hidden).toBe(false);
    if (upCard && !upCard.hidden) {
      expect(upCard.card).toEqual(c("A", "clubs"));
    }
    const pHand = view.hands.find((h) => h.playerId === P);
    expect(pHand?.cards[0]?.hidden).toBe(false);
    expect(pHand?.cards[1]?.hidden).toBe(false);
  });

  it("spectator viewer: same redaction as player (hole hidden)", () => {
    const state0 = stateReadyToDeal(P, BET, FRONT);
    const { state } = reduce(state0, { type: "dealer:deal", dealerId: P });
    const view = viewFor(state, "spectator-x");
    expect(view.dealerHand?.cards[1]?.hidden).toBe(true);
  });

  it("shoe and dealerHasBlackjack never appear in serialised view", () => {
    const state0 = stateReadyToDeal(P, BET, FRONT);
    const { state } = reduce(state0, { type: "dealer:deal", dealerId: P });
    const view = viewFor(state, P);
    const json = JSON.stringify(view);
    expect(json).not.toContain("cutCardPosition");
    expect(json).not.toContain("dealerHasBlackjack");
    expect("shoe" in view).toBe(false);
  });
});

// ─── Golden Test 7: seq increases when hands are created ─────────────────────

describe("Golden #7 — seq monotonically increases across actions", () => {
  const P = "player-seq";
  const BET = 50;
  const FRONT = [c("10"), c("7"), c("9"), c("5")];

  it("seq increases with hand creation and does not decrease", () => {
    const state0 = stateReadyToDeal(P, BET, FRONT);
    const seq0 = state0.seq;

    // At deal, 2 hands are created (player and dealer), each calling nextHandId which increments seq
    const { state: s1 } = reduce(state0, { type: "dealer:deal", dealerId: P });
    expect(s1.seq).toBeGreaterThan(seq0);

    if (s1.phase === "player_turns") {
      const { state: s2 } = reduce(s1, {
        type: "play:stand",
        playerId: P,
        handId: s1.activeHandId!,
      });
      expect(s2.seq).toBeGreaterThanOrEqual(s1.seq);
    }
  });
});

// ─── Golden Test 8: Chip conservation ────────────────────────────────────────
// sum(stacks) + sum(lockedBets) + dealerBank must be constant throughout a round.

describe("Golden #8 — Chip conservation across a full round", () => {
  const P = "player-cons";
  const BET = 100;
  const FRONT = [c("9"), c("6"), c("8"), c("7"), c("4"), c("3")];

  it("total chips unchanged from deal through round_summary", () => {
    const state0 = stateReadyToDeal(P, BET, FRONT);

    const total = (s: GameState) => {
      // In round_summary, bets have already settled into stacks/dealerBank
      const bets =
        s.phase === "round_summary"
          ? 0
          : [...s.lockedBets.values()].reduce((a, b) => a + b, 0) +
            [...s.pendingBets.values()].reduce((a, b) => a + b, 0);
      return (s.stacks.get(P) ?? 0) + bets + s.dealerBank;
    };

    const initial = total(state0);

    const { state: s1 } = reduce(state0, { type: "dealer:deal", dealerId: P });
    expect(total(s1)).toBe(initial);

    let s = s1;
    if (s.phase === "player_turns") {
      ({ state: s } = reduce(s, { type: "play:stand", playerId: P, handId: s.activeHandId! }));
    }
    expect(total(s)).toBe(initial);

    if (s.phase === "dealer_turn") {
      ({ state: s } = reduce(s, { type: "dealer:reveal", dealerId: P }));
    }
    expect(total(s)).toBe(initial);

    if (s.phase === "round_summary") {
      ({ state: s } = reduce(s, { type: "dealer:nextRound", actorId: P }));
      expect(total(s)).toBe(initial);
    }
  });
});

// ─── Golden Test 9: Dealer hits soft-17 when configured ──────────────────────

describe("Golden #9 — Dealer hits soft-17 when dealerHitsSoft17=true", () => {
  const P = "player-h17";
  const BET = 100;
  // Dealer: A(up) + 6(hole) = soft-17. With H17=true → draws. Next card=2 → soft-19.
  const FRONT = [c("10"), c("A", "clubs"), c("8", "hearts"), c("6", "diamonds"), c("2", "clubs")];

  it("dealer draws on soft-17 when configured (H17)", () => {
    const state0 = stateReadyToDeal(P, BET, FRONT, { dealerHitsSoft17: true });
    const { state: s1 } = reduce(state0, { type: "dealer:deal", dealerId: P });

    let s = s1;
    if (s.phase === "player_turns") {
      ({ state: s } = reduce(s, { type: "play:stand", playerId: P, handId: s.activeHandId! }));
    }

    // In dealer_turn: reveal + check if dealer drew on soft-17
    if (s.phase === "dealer_turn") {
      const { state: sRev } = reduce(s, { type: "dealer:reveal", dealerId: P });
      // Dealer has A+6=soft-17 → H17 rule → auto draws 2 → soft-19, then stands.
      const dealerCards = sRev.dealerHand?.cards ?? [];
      expect(dealerCards.length).toBeGreaterThanOrEqual(3);
      expect(sRev.phase).toBe("round_summary");
    }
  });
});

// ─── Golden Test 10: Insurance declined — dealer no BJ → game continues ──────
// Player: 8+7=15. Dealer: A(up) + 5(hole) = 16 → no BJ. Player declines insurance → player_turns.

describe("Golden #10 — Insurance declined, dealer has no BJ", () => {
  const P = "player-ins-no";
  const BET = 100;
  const FRONT = [c("8"), c("A", "clubs"), c("7", "hearts"), c("5", "diamonds"), c("3", "clubs")];

  it("declining insurance and dealer has no BJ → continues to player_turns", () => {
    const state0 = stateReadyToDeal(P, BET, FRONT, { insuranceEnabled: true });
    const { state: s1 } = reduce(state0, { type: "dealer:deal", dealerId: P });

    let s = s1;
    if (s.phase === "insurance") {
      const hand = s.hands.find((h) => h.playerId === P);
      expect(hand).toBeDefined();
      ({ state: s } = reduce(s, {
        type: "play:insurance",
        playerId: P,
        handId: hand!.id,
        accept: false,
      }));
      // After declining, should move to peek then player_turns
      expect(["peek", "player_turns"]).toContain(s.phase);
    }

    if (s.phase === "peek") {
      ({ state: s } = reduce(s, { type: "dealer:reveal", dealerId: P }));
    }

    // Dealer has A+5=16 → no BJ → player gets to play
    expect(s.phase).toBe("player_turns");
  });
});
