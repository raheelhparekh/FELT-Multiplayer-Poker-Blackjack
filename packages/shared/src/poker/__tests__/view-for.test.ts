import { describe, expect, it } from "vitest";
import type { Participant } from "../../types/domain.js";
import { defaultPokerConfig } from "../config.js";
import { createInitialPokerState } from "../poker-module.js";
import { reduce } from "../reduce.js";
import type { PokerState } from "../state.js";
import { viewFor } from "../view-for.js";

function setupGame(): { state: PokerState; p1: Participant; p2: Participant } {
  const cfg = defaultPokerConfig();
  const base = createInitialPokerState("VIEW01", cfg);

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

  const state: PokerState = {
    ...base,
    participants,
    players: new Map([
      [
        "alice",
        {
          id: "alice",
          seatNumber: 1,
          holeCards: [],
          stack: 1000,
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
          stack: 1000,
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

describe("Poker ViewFor & Hidden Information Contract (§6, §12.5)", () => {
  it("player sees their own hole cards but opponents cards are redacted as hidden", () => {
    const { state } = setupGame();
    const { state: activeState } = reduce(state, { type: "poker:startHand" });

    // Alice's view
    const aliceView = viewFor(activeState, "alice");
    const aliceInView = aliceView.players.find((p) => p.id === "alice")!;
    const bobInView = aliceView.players.find((p) => p.id === "bob")!;

    // Alice sees her cards
    expect(aliceInView.cards).toHaveLength(2);
    expect(aliceInView.cards[0]!.hidden).toBe(false);
    expect(aliceInView.cards[1]!.hidden).toBe(false);
    if (!aliceInView.cards[0]!.hidden) {
      expect(aliceInView.cards[0]!.card).toBeDefined();
    }

    // Alice CANNOT see Bob's cards
    expect(bobInView.cards).toHaveLength(2);
    expect(bobInView.cards[0]!.hidden).toBe(true);
    expect(bobInView.cards[1]!.hidden).toBe(true);
    expect("card" in bobInView.cards[0]!).toBe(false);
    expect("card" in bobInView.cards[1]!).toBe(false);
  });

  it("spectator and dealer see ALL hole cards as hidden", () => {
    const { state } = setupGame();
    const { state: activeState } = reduce(state, { type: "poker:startHand" });

    const specView = viewFor(activeState, "spectator-sam");
    for (const player of specView.players) {
      expect(player.cards[0]!.hidden).toBe(true);
      expect(player.cards[1]!.hidden).toBe(true);
      expect("card" in player.cards[0]!).toBe(false);
    }
  });

  it("deck and burned cards are NEVER exposed in client view or JSON", () => {
    const { state } = setupGame();
    const { state: activeState } = reduce(state, { type: "poker:startHand" });

    const view = viewFor(activeState, "alice");
    expect("deck" in view).toBe(false);
    expect("burnedCards" in view).toBe(false);

    const json = JSON.stringify(view);
    expect(json).not.toContain("deck");
    expect(json).not.toContain("burnedCards");
  });

  it("reveals cards at showdown to all viewers", () => {
    const { state } = setupGame();
    const { state: s1 } = reduce(state, { type: "poker:startHand" });
    const { state: s2 } = reduce(s1, { type: "poker:allIn", playerId: "alice" });
    const { state: s3 } = reduce(s2, { type: "poker:allIn", playerId: "bob" });

    // Showdown reached
    expect(s3.phase).toBe("hand_summary");

    // Spectator view at showdown
    const specView = viewFor(s3, "spectator-sam");
    const aliceInView = specView.players.find((p) => p.id === "alice")!;
    const bobInView = specView.players.find((p) => p.id === "bob")!;

    expect(aliceInView.cards[0]!.hidden).toBe(false);
    expect(bobInView.cards[0]!.hidden).toBe(false);
  });

  it("synchronizes hasSeenCards state across players without card leakage", () => {
    const { state } = setupGame();
    const { state: s1 } = reduce(state, { type: "poker:startHand" });

    // Initially both players start as blind (hasSeenCards = false)
    const bobViewInitial = viewFor(s1, "bob");
    const aliceInBobView1 = bobViewInitial.players.find((p) => p.id === "alice")!;
    expect(aliceInBobView1.hasSeenCards).toBe(false);
    expect(aliceInBobView1.cards[0]!.hidden).toBe(true);

    // Alice sees her cards
    const { state: s2, events } = reduce(s1, { type: "poker:seeCards", playerId: "alice" });
    expect(events).toContainEqual({ type: "playerSeenCards", playerId: "alice" });

    // Bob's view now shows Alice has seen her cards
    const bobViewAfter = viewFor(s2, "bob");
    const aliceInBobView2 = bobViewAfter.players.find((p) => p.id === "alice")!;
    expect(aliceInBobView2.hasSeenCards).toBe(true);

    // Crucially: Bob still CANNOT see Alice's card identities (hidden is true, no leak)
    expect(aliceInBobView2.cards[0]!.hidden).toBe(true);
    expect("card" in aliceInBobView2.cards[0]!).toBe(false);
  });

  it("exposes accurate stacks, totalBuyIns, initialBuyIns and rebuys for PNL ledger", () => {
    const { state } = setupGame();
    state.totalBuyIns.set("alice", 1500);
    state.initialBuyIns.set("alice", 1000);
    state.rebuys.set("alice", 500);
    state.players.get("alice")!.stack = 2200;

    const view = viewFor(state, "bob");
    expect(view.stacks["alice"]).toBe(2200);
    expect(view.totalBuyIns?.["alice"]).toBe(1500);
    expect(view.initialBuyIns?.["alice"]).toBe(1000);
    expect(view.rebuys?.["alice"]).toBe(500);

    // Net PNL = stack (2200) - totalBuyIn (1500) = +700
    const alicePlayer = view.players.find((p) => p.id === "alice")!;
    const net = alicePlayer.stack - (view.totalBuyIns?.["alice"] ?? 0);
    expect(net).toBe(700);
  });

  it("CRITICAL SAFEGUARD: does NOT reveal winner's cards when opponent folds (uncontested pot)", () => {
    const { state } = setupGame();
    const { state: s1 } = reduce(state, { type: "poker:startHand" });

    // In heads-up preflop, button (Alice) acts first. Alice raises to 100.
    const { state: s2 } = reduce(s1, { type: "poker:raise", playerId: "alice", to: 100 });
    // Bob folds
    const { state: s3 } = reduce(s2, { type: "poker:fold", playerId: "bob" });

    // Hand ends by fold: phase is hand_summary
    expect(s3.phase).toBe("hand_summary");
    expect(s3.winners?.[0]?.playerId).toBe("alice");
    expect(s3.winners?.[0]?.handName).toBe("All other players folded");

    // Bob view: Alice's cards MUST be hidden!
    const bobView = viewFor(s3, "bob");
    const aliceInBobView = bobView.players.find((p) => p.id === "alice")!;
    expect(aliceInBobView.cards[0]!.hidden).toBe(true);
    expect(aliceInBobView.cards[1]!.hidden).toBe(true);
    expect("card" in aliceInBobView.cards[0]!).toBe(false);

    // Spectator view: Alice's cards MUST also be hidden!
    const specView = viewFor(s3, "spectator-sam");
    const aliceInSpecView = specView.players.find((p) => p.id === "alice")!;
    expect(aliceInSpecView.cards[0]!.hidden).toBe(true);
    expect(aliceInSpecView.cards[1]!.hidden).toBe(true);

    // Alice herself CAN see her own cards
    const aliceView = viewFor(s3, "alice");
    const aliceInAliceView = aliceView.players.find((p) => p.id === "alice")!;
    expect(aliceInAliceView.cards[0]!.hidden).toBe(false);

    // If Alice explicitly chooses to show cards:
    const { state: s4 } = reduce(s3, { type: "poker:showCards", playerId: "alice" });
    const bobViewAfterShow = viewFor(s4, "bob");
    const aliceInBobViewAfter = bobViewAfterShow.players.find((p) => p.id === "alice")!;
    expect(aliceInBobViewAfter.cards[0]!.hidden).toBe(false);
    if (!aliceInBobViewAfter.cards[0]!.hidden) {
      expect(aliceInBobViewAfter.cards[0]!.card).toBeDefined();
    }
  });
});
