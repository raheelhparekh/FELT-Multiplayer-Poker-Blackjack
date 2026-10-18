import { formatCard } from "./cards.js";
import { defaultPokerConfig } from "./config.js";
import { createInitialPokerState } from "./poker-module.js";
import { reduce } from "./reduce.js";
import type { PokerState } from "./state.js";

export function simulatePokerHand(): void {
  console.log("=== FELT POKER ENGINE — CLI SIMULATION ===");

  const cfg = defaultPokerConfig();
  const base = createInitialPokerState("SIM01", cfg);

  const participants = new Map([
    [
      "alice",
      {
        id: "alice",
        displayName: "Alice",
        avatarId: "av-alice",
        role: "player" as const,
        seat: 1 as const,
        isConnected: true,
        isGuest: false,
      },
    ],
    [
      "bob",
      {
        id: "bob",
        displayName: "Bob",
        avatarId: "av-bob",
        role: "player" as const,
        seat: 2 as const,
        isConnected: true,
        isGuest: false,
      },
    ],
    [
      "charlie",
      {
        id: "charlie",
        displayName: "Charlie",
        avatarId: "av-charlie",
        role: "player" as const,
        seat: 3 as const,
        isConnected: true,
        isGuest: false,
      },
    ],
  ]);

  let state: PokerState = {
    ...base,
    participants,
    players: new Map([
      [
        "alice",
        {
          id: "alice",
          seatNumber: 1,
          holeCards: [],
          stack: 2000,
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
          stack: 2000,
          committedThisRound: 0,
          committedThisHand: 0,
          hasFolded: false,
          isAllIn: false,
          actedThisRound: false,
        },
      ],
      [
        "charlie",
        {
          id: "charlie",
          seatNumber: 3,
          holeCards: [],
          stack: 2000,
          committedThisRound: 0,
          committedThisHand: 0,
          hasFolded: false,
          isAllIn: false,
          actedThisRound: false,
        },
      ],
    ]),
  };

  // 1. Start Hand
  console.log("\n[1] Starting Hand...");
  const startRes = reduce(state, { type: "poker:startHand" });
  state = startRes.state;

  console.log(`Button: Seat ${state.dealerButtonSeat}`);
  console.log(`SB: Seat ${state.smallBlindSeat} (₹${state.config.smallBlind})`);
  console.log(`BB: Seat ${state.bigBlindSeat} (₹${state.config.bigBlind})`);

  for (const [id, p] of state.players) {
    console.log(`  ${id} (Seat ${p.seatNumber}): [${p.holeCards.map(formatCard).join(" ")}] Stack: ₹${p.stack}`);
  }

  // 2. Preflop Betting
  console.log(`\n[2] Preflop Action (Current Bet: ₹${state.currentBet}):`);
  console.log(`  To act: ${state.toActPlayerId}`);

  // UTG (Alice) raises to 150
  console.log(`  -> Alice raises to ₹150`);
  state = reduce(state, { type: "poker:raise", playerId: "alice", to: 150 }).state;

  // Bob (SB) folds
  console.log(`  -> Bob folds`);
  state = reduce(state, { type: "poker:fold", playerId: "bob" }).state;

  // Charlie (BB) calls
  console.log(`  -> Charlie calls ₹150`);
  state = reduce(state, { type: "poker:call", playerId: "charlie" }).state;

  // 3. Flop
  console.log(`\n[3] Dealing Flop: [${state.communityCards.map(formatCard).join(" ")}] (Pot: ₹${state.pots[0]?.amount})`);
  console.log(`  -> Charlie checks`);
  state = reduce(state, { type: "poker:check", playerId: "charlie" }).state;

  console.log(`  -> Alice bets ₹100`);
  state = reduce(state, { type: "poker:bet", playerId: "alice", amount: 100 }).state;

  console.log(`  -> Charlie calls ₹100`);
  state = reduce(state, { type: "poker:call", playerId: "charlie" }).state;

  // 4. Turn
  console.log(`\n[4] Dealing Turn: [${state.communityCards.map(formatCard).join(" ")}] (Pot: ₹${state.pots[0]?.amount})`);
  console.log(`  -> Charlie checks`);
  state = reduce(state, { type: "poker:check", playerId: "charlie" }).state;

  console.log(`  -> Alice checks`);
  state = reduce(state, { type: "poker:check", playerId: "alice" }).state;

  // 5. River
  console.log(`\n[5] Dealing River: [${state.communityCards.map(formatCard).join(" ")}] (Pot: ₹${state.pots[0]?.amount})`);
  console.log(`  -> Charlie checks`);
  state = reduce(state, { type: "poker:check", playerId: "charlie" }).state;

  console.log(`  -> Alice checks`);
  state = reduce(state, { type: "poker:check", playerId: "alice" }).state;

  // 6. Showdown
  console.log("\n[6] Showdown!");
  if (state.winners) {
    for (const w of state.winners) {
      console.log(`  🏆 Winner: ${w.playerId} wins ₹${w.amount} with ${w.handName}!`);
    }
  }

  console.log("\nFinal Stacks:");
  for (const [id, p] of state.players) {
    console.log(`  ${id}: ₹${p.stack}`);
  }

  console.log("\n=== SIMULATION COMPLETE ===");
}

if (process.argv[1]?.endsWith("cli-demo.ts")) {
  simulatePokerHand();
}
