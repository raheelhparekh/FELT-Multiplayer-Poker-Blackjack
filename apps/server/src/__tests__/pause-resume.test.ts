/**
 * Tests for pause/resume timer freeze behavior.
 *
 * Verifies:
 * - Pause during betting does NOT auto-sit-out players
 * - Pause during player turn does NOT auto-stand
 * - Resume continues game from where it left off without corrupting state
 * - Game actions are rejected while paused
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AppInstance, createServer } from "../server.js";
import { TestClient } from "./test-client.js";

describe("Pause / Resume — Timer Freeze", () => {
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

  it("pause during betting does not auto-sit-out players", async () => {
    const host = new TestClient("Host");
    const player = new TestClient("Player");
    await host.connect(serverUrl);
    await player.connect(serverUrl);

    const { roomCode } = await host.createRoom({
      displayName: "Alice",
      avatarId: "av-1",
      config: { betTimerSec: 1 } as never,
    });

    await player.joinRoom({ code: roomCode, displayName: "Bob", avatarId: "av-2" });
    await player.sit(1);
    await host.startSession();
    await player.waitForPhase("betting");

    // Pause before bet timer fires
    await host.pause();
    const pausedSnap = await player.waitForSnapshot((s) => s.isPaused === true);
    expect(pausedSnap.isPaused).toBe(true);

    // Wait well past betTimerSec (1s) — player should NOT be sat out
    await new Promise((r) => setTimeout(r, 1200));

    // Still in betting, player still seated and not sitting-out
    const checkSnap = player.latestSnapshot!;
    expect(checkSnap.phase).toBe("betting");
    const bobInSnap = checkSnap.participants.find((p) => p.id === player.playerId);
    expect(bobInSnap?.seat).toBe(1);

    host.disconnect();
    player.disconnect();
  });

  it("pause during player turn does not auto-stand", async () => {
    const host = new TestClient("Host");
    const player = new TestClient("Player");
    await host.connect(serverUrl);
    await player.connect(serverUrl);

    const { roomCode } = await host.createRoom({
      displayName: "Alice",
      avatarId: "av-1",
      config: { actionTimerSec: 1, betTimerSec: null } as never,
    });

    await player.joinRoom({ code: roomCode, displayName: "Bob", avatarId: "av-2" });
    await player.sit(1);
    await host.startSession();

    // Deal loop until we get player_turns
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

    // Pause immediately in player_turns
    await host.pause();
    const pausedSnap = await player.waitForSnapshot((s) => s.isPaused === true);
    expect(pausedSnap.isPaused).toBe(true);

    // Wait past actionTimerSec (1s)
    await new Promise((r) => setTimeout(r, 1200));

    // Still in player_turns — hand was NOT auto-stood
    const checkSnap = player.latestSnapshot!;
    expect(checkSnap.phase).toBe("player_turns");
    const myHand = checkSnap.hands.find((h) => h.playerId === player.playerId);
    expect(myHand?.isLocked).toBe(false);

    host.disconnect();
    player.disconnect();
  });

  it("resume continues game from where it left off without corrupting state", async () => {
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
    await host.startSession();

    await player.waitForPhase("betting");
    await player.betAdd(100);
    await player.betLock();

    // Pause during betting
    await host.pause();
    const snapshotPaused = await player.waitForSnapshot((s) => s.isPaused === true);
    const stackBefore = snapshotPaused.stacks[player.playerId];

    // Resume
    await host.resume();
    const snapshotResumed = await player.waitForSnapshot((s) => s.isPaused === false);
    expect(snapshotResumed.isPaused).toBe(false);
    expect(snapshotResumed.phase).toBe("betting");

    // Stack should be unchanged
    expect(snapshotResumed.stacks[player.playerId]).toBe(stackBefore);
    // Locked bets should still be there
    const lockedBets = snapshotResumed.lockedBets ?? {};
    expect(lockedBets[player.playerId]).toBe(100);

    host.disconnect();
    player.disconnect();
  });

  it("game actions are rejected while paused", async () => {
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
    await host.startSession();
    await player.waitForPhase("betting");

    await host.pause();
    await player.waitForSnapshot((s) => s.isPaused === true);

    // Betting action should fail
    await expect(player.betAdd(100)).rejects.toThrow(/paused/i);

    host.disconnect();
    player.disconnect();
  });
});
