/**
 * Tests for host recovery controls.
 *
 * Verifies:
 * - forceStand advances the game from a stuck turn
 * - cancelRound refunds all bets and returns to betting
 * - recoverDealer replaces disconnected dealer
 * - closeTable disconnects all participants and removes room
 * - Recovery actions require host role
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AppInstance, createServer } from "../server.js";
import { TestClient } from "./test-client.js";

describe("Host Recovery Controls", () => {
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

  async function setupGameAtPlayerTurns(host: TestClient, player: TestClient) {
    const { roomCode } = await host.createRoom({
      displayName: "Alice",
      avatarId: "av-1",
      config: { actionTimerSec: null, betTimerSec: null } as never,
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

    return { roomCode, handId: player.latestSnapshot!.activeHandId! };
  }

  it("forceStand advances game from a stuck player turn", async () => {
    const host = new TestClient("Host");
    const player = new TestClient("Player");
    await host.connect(serverUrl);
    await player.connect(serverUrl);

    const { handId } = await setupGameAtPlayerTurns(host, player);

    // Host force-stands the active hand
    await host.emitIntent("host:forceStand");

    // Game should advance past player_turns
    const snap = await host.waitForSnapshot(
      (s) => s.phase !== "player_turns" || s.activeHandId !== handId,
    );
    // Either advanced to dealer_turn / settlement / round_summary, or next hand
    expect(["dealer_turn", "settlement", "round_summary"]).toContain(snap.phase);

    // Activity log should mention the force stand
    const forceActivity = host.receivedActivities.find((a) => /force/i.test(a.text));
    expect(forceActivity).toBeTruthy();

    host.disconnect();
    player.disconnect();
  });

  it("cancelRound refunds all bets and returns to betting without incrementing round", async () => {
    const host = new TestClient("Host");
    const player = new TestClient("Player");
    await host.connect(serverUrl);
    await player.connect(serverUrl);

    const { roomCode } = await host.createRoom({
      displayName: "Alice",
      avatarId: "av-1",
      config: { actionTimerSec: null, betTimerSec: null } as never,
    });
    await player.joinRoom({ code: roomCode, displayName: "Bob", avatarId: "av-2" });
    await player.sit(1);
    await host.startSession();
    await player.waitForPhase("betting");

    // Lock a bet
    await player.betAdd(200);
    await player.betLock();

    // Record stack after bet locked (bet deducted)
    const snapAfterBet = await player.waitForSnapshot(
      (s) => (s.lockedBets?.[player.playerId] ?? 0) === 200,
    );
    const stackAfterBet = snapAfterBet.stacks[player.playerId]!;

    // Deal to get into active play
    await host.emitIntent("dealer:deal");
    const snapAfterDeal = await player.waitForSnapshot(
      (s) => s.phase !== "betting" && s.phase !== "dealing",
    );
    if (snapAfterDeal.phase === "insurance") {
      const hand = snapAfterDeal.hands.find((h) => h.playerId === player.playerId);
      if (hand) await player.playInsurance(hand.id, false);
    }

    // Round number before cancel
    const roundBefore = player.latestSnapshot!.roundNumber;

    // Host cancels round
    await host.emitIntent("host:cancelRound");

    // Should be back in betting
    const snap = await player.waitForSnapshot((s) => s.phase === "betting");
    expect(snap.phase).toBe("betting");

    // Bet should be refunded — stack should be restored
    const stackAfterCancel = snap.stacks[player.playerId]!;
    expect(stackAfterCancel).toBe(stackAfterBet + 200); // bet refunded

    // Round number should NOT have incremented
    expect(snap.roundNumber).toBe(roundBefore);

    // Activity should mention cancel
    const cancelActivity = host.receivedActivities.find((a) =>
      a.text.toLowerCase().includes("cancel"),
    );
    expect(cancelActivity).toBeTruthy();

    host.disconnect();
    player.disconnect();
  });

  it("recoverDealer replaces disconnected dealer", async () => {
    const host = new TestClient("Host");
    const dealer = new TestClient("Dealer");
    const newDealer = new TestClient("NewDealer");
    const player = new TestClient("Player");

    await host.connect(serverUrl);
    await dealer.connect(serverUrl);
    await newDealer.connect(serverUrl);
    await player.connect(serverUrl);

    const { roomCode } = await host.createRoom({
      displayName: "Alice",
      avatarId: "av-1",
    });
    await dealer.joinRoom({ code: roomCode, displayName: "Dan", avatarId: "av-d" });
    await newDealer.joinRoom({ code: roomCode, displayName: "NewDan", avatarId: "av-nd" });
    await player.joinRoom({ code: roomCode, displayName: "Bob", avatarId: "av-2" });

    await host.setDealer(dealer.playerId);

    // Dealer disconnects
    dealer.disconnect();
    await host.waitForSnapshot((s) => {
      const d = s.participants.find((p) => p.id === dealer.playerId);
      return d !== undefined && !d.isConnected;
    });

    // New dealer is not seated
    expect(
      host.latestSnapshot?.participants.find((p) => p.id === newDealer.playerId)?.seat,
    ).toBeNull();

    // Host recovers with new dealer
    await host.emitIntent("host:recoverDealer", { newDealerId: newDealer.playerId });

    const snap = await host.waitForSnapshot((s) => s.dealerId === newDealer.playerId);
    expect(snap.dealerId).toBe(newDealer.playerId);

    // Activity should mention the recovery
    const recoveryActivity = host.receivedActivities.find((a) => a.text.includes("NewDan"));
    expect(recoveryActivity).toBeTruthy();

    host.disconnect();
    newDealer.disconnect();
    player.disconnect();
  });

  it("recoverDealer fails if new dealer is seated as a player", async () => {
    const host = new TestClient("Host");
    const player = new TestClient("Player");
    const seatedPlayer = new TestClient("SeatedPlayer");

    await host.connect(serverUrl);
    await player.connect(serverUrl);
    await seatedPlayer.connect(serverUrl);

    const { roomCode } = await host.createRoom({
      displayName: "Alice",
      avatarId: "av-1",
    });
    await player.joinRoom({ code: roomCode, displayName: "Bob", avatarId: "av-2" });
    await seatedPlayer.joinRoom({ code: roomCode, displayName: "Charlie", avatarId: "av-3" });
    await seatedPlayer.sit(2); // Charlie is seated

    // Try to make a seated player the dealer — should fail
    await expect(
      host.emitIntent("host:recoverDealer", { newDealerId: seatedPlayer.playerId }),
    ).rejects.toThrow(/seated/i);

    host.disconnect();
    player.disconnect();
    seatedPlayer.disconnect();
  });

  it("closeTable disconnects all participants and removes the room", async () => {
    const host = new TestClient("Host");
    const player = new TestClient("Player");
    await host.connect(serverUrl);
    await player.connect(serverUrl);

    const { roomCode } = await host.createRoom({
      displayName: "Alice",
      avatarId: "av-1",
    });
    await player.joinRoom({ code: roomCode, displayName: "Bob", avatarId: "av-2" });

    // Host closes the table
    let closedReceived = false;
    player.socket?.on("room:closed", () => {
      closedReceived = true;
    });

    await host.emitIntent("host:closeTable");

    // Wait for the room:closed event
    await new Promise((r) => setTimeout(r, 200));
    expect(closedReceived).toBe(true);

    // Trying to join the room should now fail
    const visitor = new TestClient("Visitor");
    await visitor.connect(serverUrl);
    const joinResult = await new Promise<{ ok: boolean; error?: { code: string } }>((resolve) => {
      visitor.socket!.emit(
        "room:join",
        { code: roomCode, displayName: "Eve", avatarId: "av-e" },
        (res: { ok: boolean; error?: { code: string } }) => resolve(res),
      );
    });

    expect(joinResult.ok).toBe(false);
    expect(joinResult.error?.code).toBe("ROOM_NOT_FOUND");

    visitor.disconnect();
    host.disconnect();
    player.disconnect();
  });

  it("non-host cannot use recovery actions", async () => {
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
    // Loop until we reach player_turns (insurance may appear)
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

    // Player tries to force stand — should fail
    await expect(player.emitIntent("host:forceStand")).rejects.toThrow(/host/i);

    host.disconnect();
    player.disconnect();
  });
});
