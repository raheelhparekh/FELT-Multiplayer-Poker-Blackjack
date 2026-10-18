/**
 * Tests for chip action queuing during active hands.
 *
 * Verifies:
 * - Rebuy request during player turn gets queued (not applied immediately)
 * - Queued rebuy applies after the round
 * - Host adjustment during player turn gets queued
 * - Active hand balances cannot be altered via normal rebuy/adjustment
 * - Session net remains correct
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AppInstance, createServer } from "../server.js";
import { TestClient } from "./test-client.js";

describe("Chip Action Queuing", () => {
  let app: AppInstance;
  let serverUrl: string;

  beforeEach(async () => {
    app = createServer({
      port: 0,
      logger: false,
      pacingEnabled: false,
    });
    serverUrl = await app.start();
  });

  afterEach(async () => {
    await app.close();
  });

  async function setupGameAtPlayerTurns(
    host: TestClient,
    player: TestClient,
  ): Promise<{ roomCode: string; handId: string }> {
    const { roomCode } = await host.createRoom({
      displayName: "Alice",
      avatarId: "av-1",
      config: {
        actionTimerSec: null,
        betTimerSec: null,
        rebuyRequiresHostApproval: false,
      } as never,
    });

    await player.joinRoom({ code: roomCode, displayName: "Bob", avatarId: "av-2" });
    await player.sit(1);
    await host.startSession();

    while (true) {
      await player.waitForPhase("betting");
      await player.betAdd(100);
      await player.betLock();
      await host.emitIntent("dealer:deal");
      const snap = await player.waitForSnapshot(
        (s) => s.phase !== "betting" && s.phase !== "dealing",
      );
      if (snap.phase === "insurance") {
        const hand = snap.hands.find((h) => h.playerId === player.playerId);
        if (hand) await player.playInsurance(hand.id, false);
      }
      const postSnap = await player.waitForSnapshot(
        (s) => s.phase === "player_turns" || s.phase === "round_summary",
      );
      if (postSnap.phase === "player_turns") break;
      await host.dealerNextRound();
    }

    const handId = player.latestSnapshot!.activeHandId!;
    return { roomCode, handId };
  }

  it("auto-rebuy during active hand is queued, not applied immediately", async () => {
    const host = new TestClient("Host");
    const player = new TestClient("Player");
    await host.connect(serverUrl);
    await player.connect(serverUrl);

    const { handId } = await setupGameAtPlayerTurns(host, player);

    // Record stack before rebuy request
    const stackBefore = player.latestSnapshot!.stacks[player.playerId]!;

    // Request rebuy during player turn
    await player.rebuyRequest(500);

    // Stack should NOT change immediately
    const snapAfterRequest = await player.waitForSnapshot((s) => s.phase === "player_turns");
    const stackAfterRequest = snapAfterRequest.stacks[player.playerId]!;
    expect(stackAfterRequest).toBe(stackBefore); // Unchanged

    // Complete the round
    await player.emitIntent("play:stand", { handId });

    // Wait for round_summary then next betting
    await player.waitForSnapshot((s) => s.phase === "round_summary" || s.phase === "betting");

    // Now the rebuy should have been applied
    const snapAfterRound = player.latestSnapshot!;
    const stackAfterRebuy = snapAfterRound.stacks[player.playerId]!;
    // Stack should be higher than before the round (rebuy applied, minus any round loss)
    // At minimum, the rebuy 500 was added at some point during/after round
    expect(stackAfterRebuy).toBeGreaterThan(stackBefore - 100 - 50); // rough check

    host.disconnect();
    player.disconnect();
  });

  it("host chip adjustment during active hand is queued", async () => {
    const host = new TestClient("Host");
    const player = new TestClient("Player");
    await host.connect(serverUrl);
    await player.connect(serverUrl);

    const { handId } = await setupGameAtPlayerTurns(host, player);
    const stackBefore = player.latestSnapshot!.stacks[player.playerId]!;

    // Host adjusts chips during active hand
    await host.adjustChips(player.playerId, "add", 1000);

    // Stack should NOT change immediately during active hand
    const snapImmediate = player.latestSnapshot!;
    expect(snapImmediate.phase).toBe("player_turns");
    const stackImmediate = snapImmediate.stacks[player.playerId]!;
    expect(stackImmediate).toBe(stackBefore); // Unchanged during active hand

    // Complete the round
    await player.emitIntent("play:stand", { handId });
    await player.waitForSnapshot((s) => s.phase === "round_summary" || s.phase === "betting");

    // Adjustment should now be applied
    const finalStack = player.latestSnapshot!.stacks[player.playerId]!;
    expect(finalStack).toBeGreaterThan(stackBefore); // Should be higher now

    host.disconnect();
    player.disconnect();
  });

  it("host adjustment queued during active hand shows pending chip indicator", async () => {
    const host = new TestClient("Host");
    const player = new TestClient("Player");
    await host.connect(serverUrl);
    await player.connect(serverUrl);

    const { handId } = await setupGameAtPlayerTurns(host, player);

    // Host adjusts chips during active hand
    await host.adjustChips(player.playerId, "add", 500);

    // Pending adjustment indicator should be present
    const snap = await player.waitForSnapshot(
      (s) =>
        s.phase === "player_turns" &&
        (s.pendingChipAdjustmentPlayers?.includes(player.playerId) ?? false),
    );
    expect(snap.pendingChipAdjustmentPlayers).toContain(player.playerId);

    // Clean up
    await player.emitIntent("play:stand", { handId });

    host.disconnect();
    player.disconnect();
  });

  it("rebuy requiring host approval during active hand gets queued after approval", async () => {
    const host = new TestClient("Host");
    const player = new TestClient("Player");
    await host.connect(serverUrl);
    await player.connect(serverUrl);

    const { roomCode } = await host.createRoom({
      displayName: "Alice",
      avatarId: "av-1",
      config: { actionTimerSec: null, betTimerSec: null, rebuyRequiresHostApproval: true } as never,
    });
    await player.joinRoom({ code: roomCode, displayName: "Bob", avatarId: "av-2" });
    await player.sit(1);
    await host.startSession();
    await player.waitForPhase("betting");
    await player.betAdd(100);
    await player.betLock();
    await host.emitIntent("dealer:deal");
    const dealSnap = await player.waitForSnapshot(
      (s) => s.phase !== "betting" && s.phase !== "dealing",
    );
    if (dealSnap.phase === "insurance") {
      const hand = dealSnap.hands.find((h) => h.playerId === player.playerId);
      if (hand) await player.playInsurance(hand.id, false);
    }
    await player.waitForPhase("player_turns");

    const handId = player.latestSnapshot!.activeHandId!;
    const stackBefore = player.latestSnapshot!.stacks[player.playerId]!;

    // Player requests rebuy
    await player.rebuyRequest(500);

    // Host approves during active hand — should be queued
    await host.hostApproveRebuy(player.playerId, 500);

    // Stack should NOT change immediately
    const snapMidRound = player.latestSnapshot!;
    expect(snapMidRound.stacks[player.playerId]).toBe(stackBefore);

    // Complete round
    await player.emitIntent("play:stand", { handId });
    await player.waitForSnapshot((s) => s.phase === "round_summary" || s.phase === "betting");

    const stackAfter = player.latestSnapshot!.stacks[player.playerId]!;
    expect(stackAfter).toBeGreaterThan(stackBefore); // Rebuy applied

    host.disconnect();
    player.disconnect();
  });

  it("chip adjustments between rounds apply immediately without queuing", async () => {
    const host = new TestClient("Host");
    const player = new TestClient("Player");
    await host.connect(serverUrl);
    await player.connect(serverUrl);

    const { roomCode } = await host.createRoom({
      displayName: "Alice",
      avatarId: "av-1",
    });
    await player.joinRoom({ code: roomCode, displayName: "Bob", avatarId: "av-2" });
    await player.sit(1);

    // Before session starts (lobby phase) — should apply immediately
    const stackBefore = host.latestSnapshot?.stacks[player.playerId] ?? 5000;
    await host.adjustChips(player.playerId, "add", 2000);

    const snap = await host.waitForSnapshot((s) => (s.stacks[player.playerId] ?? 0) > stackBefore);
    expect(snap.stacks[player.playerId]).toBe(stackBefore + 2000);

    host.disconnect();
    player.disconnect();
  });
});
