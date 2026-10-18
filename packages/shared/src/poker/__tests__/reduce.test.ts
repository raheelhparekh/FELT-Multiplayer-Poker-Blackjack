import { describe, expect, it } from "vitest";
import type { Participant } from "../../types/domain.js";
import { defaultPokerConfig } from "../config.js";
import { createInitialPokerState, PokerModule } from "../poker-module.js";
import { reduce } from "../reduce.js";
import type { PokerState } from "../state.js";

function setupTwoPlayerGame(stack = 1000): { state: PokerState; p1: Participant; p2: Participant } {
  const cfg = defaultPokerConfig();
  const base = createInitialPokerState("POKER01", cfg);

  const p1: Participant = {
    id: "alice",
    displayName: "Alice",
    avatarId: "av-alice",
    role: "player",
    seat: 1,
    isConnected: true,
    isGuest: false,
  };
  const p2: Participant = {
    id: "bob",
    displayName: "Bob",
    avatarId: "av-bob",
    role: "player",
    seat: 2,
    isConnected: true,
    isGuest: false,
  };

  const participants = new Map([
    ["alice", p1],
    ["bob", p2],
  ]);

  const totalBuyIns = new Map([
    ["alice", stack],
    ["bob", stack],
  ]);

  // Set initial player states in state
  const state: PokerState = {
    ...base,
    participants,
    totalBuyIns,
    players: new Map([
      [
        "alice",
        {
          id: "alice",
          seatNumber: 1,
          holeCards: [],
          stack,
          committedThisRound: 0,
          committedThisHand: 0,
          hasFolded: false,
          isAllIn: false,
          actedThisRound: false,
        },
      ],
      [
        "bob",
        {
          id: "bob",
          seatNumber: 2,
          holeCards: [],
          stack,
          committedThisRound: 0,
          committedThisHand: 0,
          hasFolded: false,
          isAllIn: false,
          actedThisRound: false,
        },
      ],
    ]),
  };

  return { state, p1, p2 };
}

describe("Poker Pure Reducer (§5.3, §12.4)", () => {
  it("poker:startHand posts blinds, deals hole cards, and sets preflop toAct", () => {
    const { state } = setupTwoPlayerGame();
    const { state: s1, events } = reduce(state, { type: "poker:startHand" });

    expect(s1.phase).toBe("betting");
    expect(s1.street).toBe("preflop");
    expect(s1.handNumber).toBe(1);

    // Blinds posted
    const alice = s1.players.get("alice")!;
    const bob = s1.players.get("bob")!;

    // In heads-up: button (seat 1, Alice) is SB, seat 2 (Bob) is BB
    expect(alice.committedThisRound).toBe(s1.config.smallBlind);
    expect(bob.committedThisRound).toBe(s1.config.bigBlind);

    // Both players have 2 hole cards
    expect(alice.holeCards).toHaveLength(2);
    expect(bob.holeCards).toHaveLength(2);

    // Deck has 52 - 4 = 48 cards remaining
    expect(s1.deck).toHaveLength(48);

    // Preflop in heads-up: Alice (Button/SB) acts first
    expect(s1.toActPlayerId).toBe("alice");

    // Events emitted
    expect(events.some((e) => e.type === "handStarted")).toBe(true);
    expect(events.some((e) => e.type === "blindsPosted")).toBe(true);
    expect(events.filter((e) => e.type === "holeCardsDealt")).toHaveLength(4);
  });

  it("folds preflop: remaining player wins entire pot immediately without showdown", () => {
    const { state } = setupTwoPlayerGame();
    const { state: s1 } = reduce(state, { type: "poker:startHand" });

    // Alice is to act. Alice folds!
    const { state: s2, events: evFold } = reduce(s1, { type: "poker:fold", playerId: "alice" });

    // Hand ends immediately
    expect(s2.phase).toBe("hand_summary");
    expect(s2.toActPlayerId).toBeNull();

    // Bob wins the blinds (SB 25 + BB 50 = 75 total)
    const bob = s2.players.get("bob")!;
    expect(bob.stack).toBe(1000 - 50 + 75); // 1025
    const alice = s2.players.get("alice")!;
    expect(alice.stack).toBe(1000 - 25); // 975

    const potEv = evFold.find((e) => e.type === "potAwarded");
    expect(potEv).toBeDefined();
    if (potEv && potEv.type === "potAwarded") {
      expect(potEv.winners).toEqual(["bob"]);
    }
  });

  it("plays a full hand through Flop, Turn, River to Showdown", () => {
    const { state } = setupTwoPlayerGame(2000);
    const { state: s1 } = reduce(state, { type: "poker:startHand" });

    // Preflop:
    // Alice (SB 25) calls 25 more to match BB 50
    const { state: s2 } = reduce(s1, { type: "poker:call", playerId: "alice" });
    expect(s2.players.get("alice")!.committedThisRound).toBe(50);
    expect(s2.toActPlayerId).toBe("bob");

    // Bob (BB 50) checks his option
    const { state: s3, events: evFlop } = reduce(s2, { type: "poker:check", playerId: "bob" });

    // Betting round ends -> advances to Flop!
    expect(s3.street).toBe("flop");
    expect(s3.communityCards).toHaveLength(3);
    expect(s3.burnedCards).toHaveLength(1);
    expect(s3.pots[0]!.amount).toBe(100); // 50 + 50
    expect(evFlop.some((e) => e.type === "boardCardDealt" && e.street === "flop")).toBe(true);

    // Flop: Bob acts first postflop
    expect(s3.toActPlayerId).toBe("bob");
    const { state: s4 } = reduce(s3, { type: "poker:check", playerId: "bob" });
    // Alice checks behind
    const { state: s5 } = reduce(s4, { type: "poker:check", playerId: "alice" });

    // Advances to Turn!
    expect(s5.street).toBe("turn");
    expect(s5.communityCards).toHaveLength(4);
    expect(s5.burnedCards).toHaveLength(2);

    // Turn: Bob checks, Alice bets 100
    const { state: s6 } = reduce(s5, { type: "poker:check", playerId: "bob" });
    const { state: s7 } = reduce(s6, { type: "poker:bet", playerId: "alice", amount: 100 });
    expect(s7.toActPlayerId).toBe("bob");

    // Bob calls 100
    const { state: s8 } = reduce(s7, { type: "poker:call", playerId: "bob" });

    // Advances to River!
    expect(s8.street).toBe("river");
    expect(s8.communityCards).toHaveLength(5);
    expect(s8.burnedCards).toHaveLength(3);
    expect(s8.pots[0]!.amount).toBe(300); // 100 + 200

    // River: Bob checks, Alice checks
    const { state: s9 } = reduce(s8, { type: "poker:check", playerId: "bob" });
    const { state: s10, events: evShowdown } = reduce(s9, { type: "poker:check", playerId: "alice" });

    // Showdown!
    expect(s10.phase).toBe("hand_summary");
    expect(s10.winners).toBeDefined();
    expect(s10.winners!.length).toBeGreaterThan(0);

    // Hands revealed
    expect(evShowdown.some((e) => e.type === "handsRevealed")).toBe(true);
    expect(evShowdown.some((e) => e.type === "potAwarded")).toBe(true);
    expect(evShowdown.some((e) => e.type === "handEnded")).toBe(true);

    // Chip conservation: sum of stacks equals 4000
    const totalStacks = s10.players.get("alice")!.stack + s10.players.get("bob")!.stack;
    expect(totalStacks).toBe(4000);
  });

  it("chip conservation invariant holds at every action", () => {
    const { state } = setupTwoPlayerGame(1000);
    const initialTotal = 2000;

    let { state: s } = reduce(state, { type: "poker:startHand" });
    expect(PokerModule.invariants(s)).toEqual([]);

    // Count chips
    const countChips = (st: PokerState) => {
      let sum = 0;
      for (const p of st.players.values()) {
        sum += p.stack + p.committedThisRound;
      }
      if (st.phase !== "hand_summary") {
        for (const pot of st.pots) {
          sum += pot.amount;
        }
      }
      return sum;
    };

    expect(countChips(s)).toBe(initialTotal);

    ({ state: s } = reduce(s, { type: "poker:call", playerId: "alice" }));
    expect(countChips(s)).toBe(initialTotal);

    ({ state: s } = reduce(s, { type: "poker:check", playerId: "bob" }));
    expect(countChips(s)).toBe(initialTotal);

    ({ state: s } = reduce(s, { type: "poker:allIn", playerId: "bob" }));
    expect(countChips(s)).toBe(initialTotal);

    ({ state: s } = reduce(s, { type: "poker:fold", playerId: "alice" }));
    expect(countChips(s)).toBe(initialTotal);
    expect(s.phase).toBe("hand_summary");
  });
});
