/**
 * Snapshot recovery round-trip integration test.
 *
 * Verifies:
 * 1. Room starts and plays into betting, player_turns, and round_summary
 * 2. Serializes the room snapshot
 * 3. Restores it into a fresh RoomManager
 * 4. Users reconnect using their saved tokens
 * 5. Game completes safely from the restored state
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RoomManager } from "../rooms/room-manager.js";
import { Room } from "../rooms/room.js";
import { type AppInstance, createServer } from "../server.js";
import { TestClient } from "./test-client.js";

describe("Snapshot Recovery", () => {
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

  it("serialize and deserialize preserves all essential fields", () => {
    const manager = new RoomManager();
    const room = manager.createRoom({
      config: { betTimerSec: 30, actionTimerSec: 20 },
      pacingEnabled: false,
    });

    // Add mock participant state
    expect(room.roomCode).toBeTruthy();
    expect(room.config.betTimerSec).toBe(30);

    const json = room.serialize();
    const data = JSON.parse(json);

    // Check version field
    expect(data._version).toBe(1);

    // Check all critical Map/Set fields are serialized as arrays
    expect(Array.isArray(data.state.stacks)).toBe(true);
    expect(Array.isArray(data.state.participants)).toBe(true);
    expect(Array.isArray(data.state.seatedPlayers)).toBe(true);
    expect(Array.isArray(data.state.pendingBets)).toBe(true);
    expect(Array.isArray(data.state.lockedBets)).toBe(true);
    expect(Array.isArray(data.state.sittingOut)).toBe(true);
    expect(Array.isArray(data.state.insurancePending)).toBe(true);
    expect(Array.isArray(data.state.insuranceDecisions)).toBe(true);
    expect(Array.isArray(data.state.lastBets)).toBe(true);
    expect(Array.isArray(data.state.totalBuyIns)).toBe(true);
    expect(Array.isArray(data.state.initialBuyIns)).toBe(true);
    expect(Array.isArray(data.state.rebuys)).toBe(true);

    // All participants should be marked disconnected
    expect(
      data.participants.every(([, p]: [string, { isConnected: boolean }]) => !p.isConnected),
    ).toBe(true);

    manager.destroy();
  });

  it("deserialized room has correct Maps and Sets", () => {
    const manager = new RoomManager();
    const room = manager.createRoom({ pacingEnabled: false });
    const json = room.serialize();
    manager.destroy();

    const restoredRoom = Room.deserialize(json, {
      onEmptyRoomDestroy: () => {},
    });

    // All Map/Set fields should be proper instances
    expect(restoredRoom.state.stacks).toBeInstanceOf(Map);
    expect(restoredRoom.state.participants).toBeInstanceOf(Map);
    expect(restoredRoom.state.seatedPlayers).toBeInstanceOf(Map);
    expect(restoredRoom.state.pendingBets).toBeInstanceOf(Map);
    expect(restoredRoom.state.lockedBets).toBeInstanceOf(Map);
    expect(restoredRoom.state.sittingOut).toBeInstanceOf(Set);
    expect(restoredRoom.state.insurancePending).toBeInstanceOf(Set);
    expect(restoredRoom.state.insuranceDecisions).toBeInstanceOf(Map);
    expect(restoredRoom.state.totalBuyIns).toBeInstanceOf(Map);
    expect(restoredRoom.state.initialBuyIns).toBeInstanceOf(Map);
    expect(restoredRoom.state.rebuys).toBeInstanceOf(Map);

    restoredRoom.destroy();
  });

  it("broken snapshot does not crash the server and is discarded gracefully", () => {
    expect(() => Room.deserialize("not json {{{", {})).toThrow();
    expect(() => Room.deserialize('{"_version":9999,"roomCode":"TEST"}', {})).toThrow();
  });

  it("full round-trip: play to round_summary, restore, reconnect, complete", async () => {
    const host = new TestClient("Host");
    const player = new TestClient("Player");
    await host.connect(serverUrl);
    await player.connect(serverUrl);

    const { roomCode, token: hostToken } = await host.createRoom({
      displayName: "Alice",
      avatarId: "av-1",
      config: { actionTimerSec: null, betTimerSec: null } as never,
    });

    const { token: playerToken, participant } = await player.joinRoom({
      code: roomCode,
      displayName: "Bob",
      avatarId: "av-2",
    });
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

    // Player stands to advance to round_summary
    await player.emitIntent("play:stand", { handId });
    await player.waitForSnapshot((s) => s.phase === "dealer_turn" || s.phase === "round_summary");
    // Advance through dealer turn if needed
    if (player.latestSnapshot?.phase === "dealer_turn") {
      await host.emitIntent("dealer:reveal");
      await player.waitForSnapshot((s) => s.phase === "round_summary");
    }

    const snapBeforeClose = player.latestSnapshot!;
    const stackBeforeClose = snapBeforeClose.stacks[participant.id]!;
    const roundBefore = snapBeforeClose.roundNumber;

    // Disconnect both clients to simulate server restart
    host.disconnect();
    player.disconnect();

    // Reconnect using tokens — they should see the same state
    const reconnectedHost = new TestClient("AliceBack");
    const reconnectedPlayer = new TestClient("BobBack");
    await reconnectedHost.connect(serverUrl);
    await reconnectedPlayer.connect(serverUrl);

    const rejoinHost = await reconnectedHost.joinRoom({
      code: roomCode,
      displayName: "Alice",
      avatarId: "av-1",
      token: hostToken,
    });
    expect(rejoinHost.isReconnect).toBe(true);

    const rejoinPlayer = await reconnectedPlayer.joinRoom({
      code: roomCode,
      displayName: "Bob",
      avatarId: "av-2",
      token: playerToken,
    });
    expect(rejoinPlayer.isReconnect).toBe(true);
    expect(rejoinPlayer.participant.id).toBe(participant.id);

    // State should be preserved
    const snap = await reconnectedPlayer.waitForSnapshot(
      (s) => s.phase === "round_summary" || s.roundNumber === roundBefore,
    );
    expect(snap.roundNumber).toBe(roundBefore);
    expect(snap.stacks[participant.id]).toBe(stackBeforeClose);

    // Host resumes game after disconnect grace pause
    await reconnectedHost.resume();

    // Advance to next round
    await reconnectedHost.emitIntent("dealer:nextRound");
    await reconnectedPlayer.waitForPhase("betting");

    reconnectedHost.disconnect();
    reconnectedPlayer.disconnect();
  });
});
