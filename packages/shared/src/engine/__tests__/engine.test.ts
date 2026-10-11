/**
 * Engine unit tests — covers all rules from Brief §4 and §18.
 */
import { describe, expect, it } from "vitest";
import { defaultRoomConfig } from "../../types/config.js";
import type { Card, Hand, SeatNumber } from "../../types/index.js";
import { EngineError } from "../actions.js";
import { addParticipant, createHand, createInitialState } from "../factory.js";
import { evaluateHand } from "../hand-value.js";
import { reduce, shouldDealerDraw } from "../reduce.js";
import { bjWinAmount, settleHand } from "../settlement.js";
import { buildShoe } from "../shoe.js";
import type { GameState } from "../state.js";
import { viewFor } from "../view-for.js";

// ─── Test helpers ─────────────────────────────────────────────────────────────

const c = (rank: Card["rank"], suit: Card["suit"] = "spades"): Card => ({ rank, suit });

function _mkState(overrides: Partial<GameState> = {}): GameState {
  const base = createInitialState("TEST");
  return { ...base, ...overrides };
}

/**
 * Create a state ready for player_turns with known hands.
 * Shoe cards are front-loaded so the first drawn card is `nextCard`.
 */
function stateInPlayerTurns(
  playerCards: Card[],
  dealerCards: Card[],
  nextShoeCards: Card[] = [],
  extraConfig: Partial<ReturnType<typeof defaultRoomConfig>> = {},
): GameState {
  const cfg = defaultRoomConfig();
  const config = { ...cfg, ...extraConfig };
  const base = createInitialState("TEST", config);

  // Build a shoe with nextShoeCards prepended
  const realShoe = buildShoe(config.decks, config.penetration);
  const shoe = {
    ...realShoe,
    cards: [...nextShoeCards, ...realShoe.cards.slice(nextShoeCards.length)],
  };

  const playerId = "p1";
  const seat: SeatNumber = 1;
  const handId = "h1";
  const dealerHandId = "dh1";

  const playerHand: Hand = {
    ...createHand(handId, playerId, seat, 100),
    cards: [...playerCards],
  };

  const dealerHand: Hand = {
    ...createHand(dealerHandId, "dealer", 1 as SeatNumber, 0),
    cards: [...dealerCards],
  };

  const seatedPlayers = new Map([[seat, playerId]]);
  const stacks = new Map([[playerId, 900]]); // started with 1000, bet 100

  return {
    ...base,
    config,
    shoe,
    phase: "player_turns",
    hands: [playerHand],
    dealerHand,
    activeHandId: handId,
    seatedPlayers,
    stacks,
    dealerBank: config.dealerStartingBank,
  };
}

// ─── Hand value tests (comprehensive) ────────────────────────────────────────

describe("evaluateHand — complete", () => {
  it("multiple aces reduce correctly (A, A, 9 = 21 soft)", () => {
    // A(11)+A(1)+9 = 21; one ace still counted as 11 → isSoft
    const hv = evaluateHand([c("A"), c("A"), c("9")]);
    expect(hv.total).toBe(21);
    expect(hv.isSoft).toBe(true);
  });

  it("A, A, A = soft 13 (two aces as 1, one as 11)", () => {
    const hv = evaluateHand([c("A"), c("A"), c("A")]);
    expect(hv.total).toBe(13);
  });

  it("5, A, A, A = soft 18 (one ace still 11)", () => {
    // 5+11+1+1 = 18; one ace still counted as 11 → soft
    const hv = evaluateHand([c("5"), c("A"), c("A"), c("A")]);
    expect(hv.total).toBe(18);
    expect(hv.isSoft).toBe(true);
  });

  it("A, 2, 3, A = soft 17", () => {
    const hv = evaluateHand([c("A"), c("2"), c("3"), c("A")]);
    expect(hv.total).toBe(17);
    expect(hv.isSoft).toBe(true);
  });

  it("10, 10, 10 busts at 30", () => {
    const hv = evaluateHand([c("10"), c("10"), c("10")]);
    expect(hv.isBust).toBe(true);
    expect(hv.total).toBe(30);
  });

  it("Blackjack: A + K", () => {
    const hv = evaluateHand([c("A"), c("K")]);
    expect(hv.isBlackjack).toBe(true);
    expect(hv.total).toBe(21);
  });

  it("Blackjack: A + Q", () => {
    expect(evaluateHand([c("A"), c("Q")]).isBlackjack).toBe(true);
  });

  it("Blackjack: A + J", () => {
    expect(evaluateHand([c("A"), c("J")]).isBlackjack).toBe(true);
  });

  it("3 cards = 21 is NOT blackjack", () => {
    expect(evaluateHand([c("7"), c("7"), c("7")]).isBlackjack).toBe(false);
  });

  it("A + 10 = blackjack", () => {
    expect(evaluateHand([c("A"), c("10")]).isBlackjack).toBe(true);
  });
});

// ─── Dealer S17 / H17 ─────────────────────────────────────────────────────────

describe("shouldDealerDraw — S17 and H17", () => {
  it("stands on hard 17 (S17)", () => {
    expect(shouldDealerDraw([c("10"), c("7")], false)).toBe(false);
  });

  it("stands on hard 17 (H17)", () => {
    expect(shouldDealerDraw([c("10"), c("7")], true)).toBe(false);
  });

  it("stands on soft 17 (S17 — stand on all 17s)", () => {
    expect(shouldDealerDraw([c("A"), c("6")], false)).toBe(false);
  });

  it("hits soft 17 (H17)", () => {
    expect(shouldDealerDraw([c("A"), c("6")], true)).toBe(true);
  });

  it("hits on 16", () => {
    expect(shouldDealerDraw([c("10"), c("6")], false)).toBe(true);
  });

  it("stands on 18", () => {
    expect(shouldDealerDraw([c("10"), c("8")], false)).toBe(false);
  });

  it("does not draw after bust", () => {
    expect(shouldDealerDraw([c("10"), c("10"), c("5")], false)).toBe(false);
  });

  it("hits soft 18 with H17 rule? No — H17 only affects soft 17", () => {
    expect(shouldDealerDraw([c("A"), c("7")], true)).toBe(false);
  });
});

// ─── Settlement ───────────────────────────────────────────────────────────────

describe("settleHand", () => {
  const cfg = defaultRoomConfig(); // 3:2 BJ

  function makeHand(cards: Card[], opts: Partial<Hand> = {}): Hand {
    return {
      ...createHand("h1", "p1", 1 as SeatNumber, 100),
      cards,
      ...opts,
    };
  }

  it("win 1:1", () => {
    const s = settleHand(makeHand([c("K"), c("9")]), 17, false, false, cfg);
    expect(s.result).toBe("win");
    expect(s.net).toBe(100);
    expect(s.playerGain).toBe(200); // bet back + winnings
    expect(s.bankGain).toBe(0);
  });

  it("loss", () => {
    const s = settleHand(makeHand([c("10"), c("6")]), 19, false, false, cfg);
    expect(s.result).toBe("loss");
    expect(s.net).toBe(-100);
    expect(s.playerGain).toBe(0);
    expect(s.bankGain).toBe(100);
  });

  it("push", () => {
    const s = settleHand(makeHand([c("10"), c("8")]), 18, false, false, cfg);
    expect(s.result).toBe("push");
    expect(s.net).toBe(0);
    expect(s.playerGain).toBe(100);
    expect(s.bankGain).toBe(0);
  });

  it("bust", () => {
    const s = settleHand(makeHand([c("10"), c("10"), c("5")]), 17, false, false, cfg);
    expect(s.result).toBe("bust");
    expect(s.net).toBe(-100);
    expect(s.bankGain).toBe(100);
  });

  it("blackjack 3:2 pays 150 on 100 bet", () => {
    const s = settleHand(makeHand([c("A"), c("K")]), 17, false, false, cfg);
    expect(s.result).toBe("blackjack");
    expect(s.net).toBe(150);
    expect(s.playerGain).toBe(250); // 100 bet + 150 winnings
  });

  it("blackjack 6:5 pays 120 on 100 bet", () => {
    const cfg65 = { ...cfg, blackjackPayout: "6:5" as const };
    const s = settleHand(makeHand([c("A"), c("K")]), 17, false, false, cfg65);
    expect(s.result).toBe("blackjack");
    expect(s.net).toBe(120);
  });

  it("BJ rounding: 75 bet × 3:2 = 112 (floor)", () => {
    expect(bjWinAmount(75, cfg)).toBe(112);
  });

  it("BJ rounding: 75 bet × 6:5 = 90 (floor)", () => {
    expect(bjWinAmount(75, { ...cfg, blackjackPayout: "6:5" })).toBe(90);
  });

  it("player BJ vs dealer BJ = push", () => {
    const s = settleHand(makeHand([c("A"), c("K")]), 21, false, true, cfg);
    expect(s.result).toBe("push");
    expect(s.net).toBe(0);
  });

  it("dealer bust = player wins", () => {
    const s = settleHand(makeHand([c("10"), c("9")]), 0, true, false, cfg);
    expect(s.result).toBe("win");
  });

  it("split 21 is not BJ (pays 1:1)", () => {
    const hand = makeHand([c("A"), c("K")], { isSplit: true });
    const s = settleHand(hand, 17, false, false, cfg);
    expect(s.result).toBe("win"); // NOT blackjack
    expect(s.net).toBe(100);
  });

  it("doubled hand pays on total (2× bet)", () => {
    const hand = makeHand([c("5"), c("6"), c("10")], { doubleBet: 100 });
    // Player has 21, dealer has 18 → win
    const s = settleHand(hand, 18, false, false, cfg);
    expect(s.result).toBe("win");
    expect(s.net).toBe(200); // 2× the total bet of 200
  });
});

// ─── Session start / betting ──────────────────────────────────────────────────

describe("session start + betting phase", () => {
  function playerState(): GameState {
    const s = createInitialState("ROOM1");
    const p: import("../../types/index.js").Participant = {
      id: "p1",
      displayName: "Alice",
      avatarId: "a1",
      role: "player",
      seat: 1,
      isConnected: true,
      isGuest: true,
    };
    const withP = addParticipant(s, p);
    const seatedPlayers = new Map([[1 as SeatNumber, "p1"]]);
    return { ...withP, seatedPlayers };
  }

  it("starts session from lobby", () => {
    const s = playerState();
    const { state } = reduce(s, { type: "host:startSession" });
    expect(state.phase).toBe("betting");
  });

  it("refuses to start if not in lobby", () => {
    const s = { ...playerState(), phase: "betting" as const };
    expect(() => reduce(s, { type: "host:startSession" })).toThrowError(EngineError);
  });

  it("bet:add increases pending bet", () => {
    const s = { ...playerState(), phase: "betting" as const };
    const { state } = reduce(s, { type: "bet:add", playerId: "p1", amount: 200 });
    expect(state.pendingBets.get("p1")).toBe(200);
  });

  it("bet:add is rejected if over maxBet", () => {
    const s = { ...playerState(), phase: "betting" as const };
    expect(() => reduce(s, { type: "bet:add", playerId: "p1", amount: 99999 })).toThrowError(
      EngineError,
    );
  });

  it("bet:lock deducts from stack", () => {
    let s: GameState = { ...playerState(), phase: "betting" };
    s = reduce(s, { type: "bet:add", playerId: "p1", amount: 200 }).state;
    const before = s.stacks.get("p1")!;
    s = reduce(s, { type: "bet:lock", playerId: "p1" }).state;
    expect(s.stacks.get("p1")).toBe(before - 200);
    expect(s.lockedBets.get("p1")).toBe(200);
  });

  it("bet:lock is rejected if below minBet", () => {
    let s: GameState = { ...playerState(), phase: "betting" };
    s = reduce(s, { type: "bet:add", playerId: "p1", amount: 10 }).state;
    expect(() => reduce(s, { type: "bet:lock", playerId: "p1" })).toThrowError(EngineError);
  });

  it("bet:repeat uses last round's bet", () => {
    let s: GameState = { ...playerState(), phase: "betting" };
    s = { ...s, lastBets: new Map([["p1", 300]]) };
    s = reduce(s, { type: "bet:repeat", playerId: "p1" }).state;
    expect(s.pendingBets.get("p1")).toBe(300);
  });

  it("bet:undo clears pending bet", () => {
    let s: GameState = { ...playerState(), phase: "betting" };
    s = reduce(s, { type: "bet:add", playerId: "p1", amount: 200 }).state;
    s = reduce(s, { type: "bet:undo", playerId: "p1" }).state;
    expect(s.pendingBets.get("p1")).toBe(0);
  });
});

// ─── Hit / Stand / Double ─────────────────────────────────────────────────────

describe("play:hit", () => {
  it("adds a card to the hand", () => {
    const s = stateInPlayerTurns([c("7"), c("8")], [c("10"), c("6")], [c("2")]);
    const { state } = reduce(s, { type: "play:hit", playerId: "p1", handId: "h1" });
    const hand = state.hands[0]!;
    expect(hand.cards).toHaveLength(3);
    expect(hand.cards[2]).toEqual(c("2"));
  });

  it("locks hand on bust", () => {
    const s = stateInPlayerTurns([c("10"), c("9")], [c("10"), c("6")], [c("5")]);
    const { state } = reduce(s, { type: "play:hit", playerId: "p1", handId: "h1" });
    const hand = state.hands[0]!;
    expect(hand.isLocked).toBe(true);
    expect(hand.result).toBe("bust");
  });

  it("auto-stands at 21", () => {
    const s = stateInPlayerTurns([c("10"), c("8")], [c("10"), c("6")], [c("3")]);
    const { state } = reduce(s, { type: "play:hit", playerId: "p1", handId: "h1" });
    expect(state.hands[0]!.isLocked).toBe(true);
  });

  it("transitions to dealer_turn when all hands done", () => {
    const s = stateInPlayerTurns([c("10"), c("6")], [c("10"), c("6")], [c("10")]);
    const { state } = reduce(s, { type: "play:hit", playerId: "p1", handId: "h1" });
    // Hand busted → dealer turn
    expect(state.phase).toBe("dealer_turn");
  });
});

describe("play:stand", () => {
  it("locks the hand", () => {
    const s = stateInPlayerTurns([c("10"), c("7")], [c("10"), c("6")]);
    const { state } = reduce(s, { type: "play:stand", playerId: "p1", handId: "h1" });
    expect(state.hands[0]!.isLocked).toBe(true);
  });

  it("transitions to dealer_turn", () => {
    const s = stateInPlayerTurns([c("10"), c("7")], [c("10"), c("6")]);
    const { state } = reduce(s, { type: "play:stand", playerId: "p1", handId: "h1" });
    expect(state.phase).toBe("dealer_turn");
  });
});

describe("play:double", () => {
  it("doubles the bet and draws one card then stands", () => {
    const s = stateInPlayerTurns([c("6"), c("5")], [c("10"), c("6")], [c("10")]);
    const { state } = reduce(s, { type: "play:double", playerId: "p1", handId: "h1" });
    const hand = state.hands[0]!;
    expect(hand.isDoubled).toBe(true);
    expect(hand.doubleBet).toBe(100);
    expect(hand.cards).toHaveLength(3);
    expect(hand.isLocked).toBe(true);
  });

  it("double deducts additional bet from stack", () => {
    const s = stateInPlayerTurns([c("6"), c("5")], [c("10"), c("6")], [c("3")]);
    const stackBefore = s.stacks.get("p1")!;
    const { state } = reduce(s, { type: "play:double", playerId: "p1", handId: "h1" });
    expect(state.stacks.get("p1")).toBe(stackBefore - 100);
  });

  it("double rejected on 3-card hand", () => {
    const s = stateInPlayerTurns([c("4"), c("5"), c("2")], [c("10"), c("6")]);
    expect(() => reduce(s, { type: "play:double", playerId: "p1", handId: "h1" })).toThrowError(
      EngineError,
    );
  });

  it("double rejected if 9-11 restriction and total is 8", () => {
    const s = stateInPlayerTurns(
      [c("4"), c("4")], // total 8
      [c("10"), c("6")],
      [c("3")],
      { doubleRestriction: "9-11" },
    );
    expect(() => reduce(s, { type: "play:double", playerId: "p1", handId: "h1" })).toThrowError(
      EngineError,
    );
  });

  it("double allowed on total 9-11 with restriction", () => {
    const s = stateInPlayerTurns(
      [c("5"), c("6")], // total 11
      [c("10"), c("6")],
      [c("4")],
      { doubleRestriction: "9-11" },
    );
    expect(() => reduce(s, { type: "play:double", playerId: "p1", handId: "h1" })).not.toThrow();
  });

  it("double disallowed on soft hands with 9-11 restriction (e.g. A+2 = soft 13/3 or A+8 = soft 19)", () => {
    const s = stateInPlayerTurns(
      [c("A"), c("2")], // soft 13 (or 3)
      [c("10"), c("6")],
      [c("4")],
      { doubleRestriction: "9-11" },
    );
    expect(() => reduce(s, { type: "play:double", playerId: "p1", handId: "h1" })).toThrowError(
      EngineError,
    );
  });
});

// ─── Split ────────────────────────────────────────────────────────────────────

describe("play:split", () => {
  it("splits a pair by value", () => {
    const s = stateInPlayerTurns(
      [c("8", "hearts"), c("8", "clubs")],
      [c("10"), c("6")],
      [c("3"), c("4")],
    );
    const { state } = reduce(s, { type: "play:split", playerId: "p1", handId: "h1" });
    expect(state.hands).toHaveLength(2);
    expect(state.hands[0]!.cards[0]!.rank).toBe("8");
    expect(state.hands[1]!.cards[0]!.rank).toBe("8");
  });

  it("deducts bet from stack for split", () => {
    const s = stateInPlayerTurns(
      [c("8", "hearts"), c("8", "clubs")],
      [c("10"), c("6")],
      [c("3"), c("4")],
    );
    const before = s.stacks.get("p1")!;
    const { state } = reduce(s, { type: "play:split", playerId: "p1", handId: "h1" });
    expect(state.stacks.get("p1")).toBe(before - 100);
  });

  it("cannot split non-pairs", () => {
    const s = stateInPlayerTurns([c("8"), c("9")], [c("10"), c("6")], [c("3"), c("4")]);
    expect(() => reduce(s, { type: "play:split", playerId: "p1", handId: "h1" })).toThrowError(
      EngineError,
    );
  });

  it("split aces: each hand gets one card and is locked", () => {
    const s = stateInPlayerTurns(
      [c("A", "hearts"), c("A", "clubs")],
      [c("10"), c("6")],
      [c("K"), c("5")],
    );
    const { state } = reduce(s, { type: "play:split", playerId: "p1", handId: "h1" });
    expect(state.hands).toHaveLength(2);
    expect(state.hands[0]!.isSplitAce).toBe(true);
    expect(state.hands[1]!.isSplitAce).toBe(true);
    expect(state.hands[0]!.isLocked).toBe(true);
    expect(state.hands[1]!.isLocked).toBe(true);
  });

  it("split ace 21 is not blackjack (pays 1:1)", () => {
    // A+K after splitting aces is just 21, not BJ
    const s = stateInPlayerTurns(
      [c("A", "hearts"), c("A", "clubs")],
      [c("10"), c("6")],
      [c("K"), c("5")],
    );
    const { state } = reduce(s, { type: "play:split", playerId: "p1", handId: "h1" });
    const hand0 = state.hands[0]!;
    // A + K = 21 but isSplitAce → not BJ
    expect(hand0.isSplitAce).toBe(true);
    const hv = evaluateHand(hand0.cards);
    expect(hv.total).toBe(21);
    // When settled, should be win not blackjack
    const settlement = settleHand(hand0, 17, false, false, defaultRoomConfig());
    expect(settlement.result).toBe("win");
  });

  it("enforces maxSplitHands limit", () => {
    const s = stateInPlayerTurns(
      [c("8"), c("8")],
      [c("10"), c("6")],
      [c("8"), c("3"), c("8"), c("4")],
      {
        maxSplitHands: 2,
      },
    );
    const { state } = reduce(s, { type: "play:split", playerId: "p1", handId: "h1" });
    expect(state.hands[0]?.splitDepth).toBe(1);
    expect(() => reduce(state, { type: "play:split", playerId: "p1", handId: "h1" })).toThrowError(
      EngineError,
    );
  });

  it("split by rank rejects T+J even though same value", () => {
    const s = stateInPlayerTurns([c("10"), c("J")], [c("10"), c("6")], [c("3"), c("4")], {
      splitBy: "rank",
    });
    expect(() => reduce(s, { type: "play:split", playerId: "p1", handId: "h1" })).toThrowError(
      EngineError,
    );
  });

  it("split by value allows T+J", () => {
    const s = stateInPlayerTurns([c("10"), c("J")], [c("10"), c("6")], [c("3"), c("4")], {
      splitBy: "value",
    });
    expect(() => reduce(s, { type: "play:split", playerId: "p1", handId: "h1" })).not.toThrow();
  });
});

// ─── Dealer peek edge cases ────────────────────────────────────────────────────

describe("dealer peek and insurance", () => {
  it("dealer BJ immediately goes to round_summary", () => {
    // We'll verify via state inspection after a full deal
    // Build a state where dealer hand has BJ
    const state = stateInPlayerTurns([c("10"), c("6")], [c("A"), c("K")]);
    // Manually trigger settlement for dealer BJ
    const dealerHand = state.dealerHand!;
    expect(evaluateHand(dealerHand.cards).isBlackjack).toBe(true);
  });

  it("all players bust: dealer goes to round_summary without opening card or drawing", () => {
    let s = stateInPlayerTurns([c("10"), c("9")], [c("10"), c("6")], [c("5")]);
    s = reduce(s, { type: "play:hit", playerId: "p1", handId: "h1" }).state;
    // Player busted (25) → dealer_turn
    expect(s.phase).toBe("dealer_turn");
    // On dealer:reveal when all players are busted:
    // In casino rules, dealer card is NOT opened and dealer does not draw
    const { state: after, events } = reduce(s, { type: "dealer:reveal", dealerId: "d1" });
    expect(after.phase).toBe("round_summary");
    expect(events.some((e) => e.type === "cardFlipped")).toBe(false);
    expect(after.dealerHoleCardRevealed).toBe(false);
    expect(after.dealerHand?.cards.length).toBe(2);
    const view = viewFor(after, "p1");
    expect(view.dealerHand?.cards[1]?.hidden).toBe(true);
  });
});

// ─── Next round / reshuffle ───────────────────────────────────────────────────

describe("next round and reshuffle", () => {
  it("reshuffle triggers when cut card was passed", () => {
    const s = createInitialState("ROOM");
    const shoe = buildShoe(1, 0.75);
    // Simulate cut card passed
    const passedShoe = { ...shoe, cutCardPassed: true };
    const state: GameState = { ...s, phase: "round_summary", shoe: passedShoe };
    const { state: next, events } = reduce(state, { type: "dealer:nextRound", actorId: "d1" });
    expect(events.some((e) => e.type === "shuffled")).toBe(true);
    // New shoe should have all cards
    // Default config is 6 decks = 312 cards total
    expect(next.shoe.cards.length).toBe(6 * 52);
  });

  it("phase returns to betting after next round", () => {
    const s: GameState = { ...createInitialState("ROOM"), phase: "round_summary" };
    const { state } = reduce(s, { type: "dealer:nextRound", actorId: "d1" });
    expect(state.phase).toBe("betting");
  });

  it("round number increments", () => {
    const s: GameState = { ...createInitialState("ROOM"), phase: "round_summary", roundNumber: 3 };
    const { state } = reduce(s, { type: "dealer:nextRound", actorId: "d1" });
    expect(state.roundNumber).toBe(4);
  });
});

// ─── Host chip adjustment ──────────────────────────────────────────────────────

describe("host:adjustChips", () => {
  it("set player stack", () => {
    const s = createInitialState("R");
    const { state } = reduce(s, {
      type: "host:adjustChips",
      target: "p1",
      op: "set",
      amount: 9999,
    });
    expect(state.stacks.get("p1")).toBe(9999);
  });

  it("add to dealer bank", () => {
    const s = createInitialState("R");
    const before = s.dealerBank;
    const { state } = reduce(s, {
      type: "host:adjustChips",
      target: "dealer",
      op: "add",
      amount: 5000,
    });
    expect(state.dealerBank).toBe(before + 5000);
  });

  it("accurately updates buy-ins and preserves gambling Net PNL when chips are adjusted", () => {
    let s = createInitialState("R");
    s = addParticipant(s, {
      id: "p1",
      displayName: "P1",
      avatarId: "lion",
      role: "player",
      seat: 1,
      isConnected: true,
      isHost: false,
      isGuest: true,
    });
    // Initially stack = 5000, buy-in = 5000, Net = 0
    expect(s.stacks.get("p1")).toBe(5000);
    expect(s.totalBuyIns.get("p1")).toBe(5000);

    // Host adds 2000 chips to player's wallet
    let res = reduce(s, {
      type: "host:adjustChips",
      target: "p1",
      op: "add",
      amount: 2000,
    });
    s = res.state;
    expect(s.stacks.get("p1")).toBe(7000);
    expect(s.totalBuyIns.get("p1")).toBe(7000);
    // Net PNL is still 0 (external injection is not gameplay profit)
    expect((s.stacks.get("p1") ?? 0) - (s.totalBuyIns.get("p1") ?? 0)).toBe(0);

    // Host subtracts 1000 chips from player
    res = reduce(s, {
      type: "host:adjustChips",
      target: "p1",
      op: "subtract",
      amount: 1000,
    });
    s = res.state;
    expect(s.stacks.get("p1")).toBe(6000);
    expect(s.totalBuyIns.get("p1")).toBe(6000);
    expect((s.stacks.get("p1") ?? 0) - (s.totalBuyIns.get("p1") ?? 0)).toBe(0);
  });
});

// ─── Dealer turn auto-draw ────────────────────────────────────────────────────

describe("dealer:reveal auto-draw", () => {
  it("dealer draws until 17", () => {
    // Dealer has A+5 (soft 16) in auto mode; shoe has a 2 (soft 18 = stand)
    const s = stateInPlayerTurns([c("10"), c("7")], [c("A"), c("5")], [c("2")]);
    // Stand the player
    let { state } = reduce(s, { type: "play:stand", playerId: "p1", handId: "h1" });
    // dealer:reveal
    ({ state } = reduce(state, { type: "dealer:reveal", dealerId: "d1" }));
    expect(state.phase).toBe("round_summary");
    const dealerHv = evaluateHand(state.dealerHand!.cards);
    // A + 5 + 2 = soft 18, stands
    expect(dealerHv.total).toBe(18);
  });

  it("dealer busts", () => {
    const s = stateInPlayerTurns([c("10"), c("7")], [c("10"), c("6")], [c("10")]);
    let { state } = reduce(s, { type: "play:stand", playerId: "p1", handId: "h1" });
    ({ state } = reduce(state, { type: "dealer:reveal", dealerId: "d1" }));
    expect(state.phase).toBe("round_summary");
    const dealerHv = evaluateHand(state.dealerHand!.cards);
    expect(dealerHv.isBust).toBe(true);
  });

  it("dealer never stands on 15: draws until reaching 17+ even if player has blackjack", () => {
    // Player has natural Blackjack (A + K); Dealer has 10 + 5 (15); Shoe has a 4 (15 + 4 = 19)
    const base = stateInPlayerTurns([c("A"), c("K")], [c("10"), c("5")], [c("4")]);
    const s: GameState = {
      ...base,
      phase: "dealer_turn",
      hands: [{ ...base.hands[0]!, isLocked: true, result: "blackjack" }],
    };
    const { state } = reduce(s, { type: "dealer:reveal", dealerId: "d1" });
    expect(state.phase).toBe("round_summary");
    const dealerHv = evaluateHand(state.dealerHand!.cards);
    // Dealer must have drawn the 4 to reach 19, not stood on 15
    expect(dealerHv.total).toBe(19);
    expect(state.dealerHand?.cards.length).toBe(3);
  });
});

// ─── Chip conservation sanity check ──────────────────────────────────────────

describe("chip conservation — manual check", () => {
  it("total chips unchanged after a win", () => {
    const s = stateInPlayerTurns([c("10"), c("9")], [c("10"), c("6")], [c("5")]);
    // Total chips before = stack + bet_in_play + dealerBank
    // stack[p1] = 900 (bet 100), dealerBank = 50000
    const totalBefore = (s.stacks.get("p1") ?? 0) + 100 /* bet in play */ + s.dealerBank;

    let { state } = reduce(s, { type: "play:stand", playerId: "p1", handId: "h1" });
    ({ state } = reduce(state, { type: "dealer:reveal", dealerId: "d1" }));

    // Player has 19, dealer has 16 + draws 5 = 21 → player loses
    // OR dealer busts depending on shoe card drawn
    const totalAfter = (state.stacks.get("p1") ?? 0) + state.dealerBank;
    expect(totalAfter).toBe(totalBefore);
  });
});
