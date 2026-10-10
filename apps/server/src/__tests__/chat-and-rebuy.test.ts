import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AppInstance, createServer } from "../server.js";
import { TestClient } from "./test-client.js";

describe("Chat, Rebuy & Rate Limiting", () => {
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

  it("broadcasts chat messages to all connected participants", async () => {
    const host = new TestClient("Host");
    const player = new TestClient("Player");
    await host.connect(serverUrl);
    await player.connect(serverUrl);

    const { roomCode } = await host.createRoom({
      displayName: "Alice",
      avatarId: "av-1",
    });

    await player.joinRoom({
      code: roomCode,
      displayName: "Bob",
      avatarId: "av-2",
    });

    await player.waitForSnapshot((s) => s.participants.length === 2);

    // Bob sends a chat message
    await player.sendChat("Hello everyone!");

    // Both host and player receive the chat event
    await host.waitForSnapshot((_s) => host.receivedChats.length >= 1);
    expect(host.receivedChats[0]?.text).toBe("Hello everyone!");
    expect(host.receivedChats[0]?.senderName).toBe("Bob");

    host.disconnect();
    player.disconnect();
  });

  it("enforces chat rate limits (max 5 in 5 seconds)", async () => {
    const host = new TestClient("Host");
    await host.connect(serverUrl);

    await host.createRoom({
      displayName: "Alice",
      avatarId: "av-1",
    });

    // Send 5 rapid messages (all ok)
    for (let i = 1; i <= 5; i++) {
      await host.sendChat(`Message ${i}`);
    }

    // 6th message should be rejected due to rate limiting
    await expect(host.sendChat("Message 6")).rejects.toThrow(/rate limit/i);

    host.disconnect();
  });

  it("respects spectatorsCanChat = false config", async () => {
    const host = new TestClient("Host");
    const spectator = new TestClient("Spectator");
    await host.connect(serverUrl);
    await spectator.connect(serverUrl);

    const { roomCode } = await host.createRoom({
      displayName: "Alice",
      avatarId: "av-1",
      config: {
        ...app.roomManager.createRoom().config,
        spectatorsCanChat: false,
      },
    });

    await spectator.joinRoom({
      code: roomCode,
      displayName: "Bob",
      avatarId: "av-2",
    });

    await spectator.waitForSnapshot((s) => s.participants.length === 2);

    // Spectator chat should be rejected
    await expect(spectator.sendChat("Hi from spectator")).rejects.toThrow(
      /spectator chat is disabled/i,
    );

    // Host can still chat
    await host.sendChat("Host is speaking");
    expect(host.receivedChats.length).toBe(1);

    host.disconnect();
    spectator.disconnect();
  });

  it("processes rebuys between rounds", async () => {
    const host = new TestClient("Host");
    const player = new TestClient("Player");
    await host.connect(serverUrl);
    await player.connect(serverUrl);

    const { roomCode } = await host.createRoom({
      displayName: "Alice",
      avatarId: "av-1",
      config: {
        ...app.roomManager.createRoom().config,
        rebuyEnabled: true,
        rebuyAmount: 2000,
        rebuyRequiresHostApproval: true,
      },
    });

    await player.joinRoom({
      code: roomCode,
      displayName: "Bob",
      avatarId: "av-2",
    });

    // Set Bob's stack to 0 using host chip adjustment
    await host.adjustChips(player.playerId, "set", 0);
    await player.waitForSnapshot((s) => s.stacks[player.playerId] === 0);

    // Bob requests rebuy
    await player.rebuyRequest();

    // Host approves rebuy
    await host.hostApproveRebuy(player.playerId);

    // Bob's stack is now updated to rebuyAmount
    const snapAfterRebuy = await player.waitForSnapshot((s) => s.stacks[player.playerId] === 2000);
    expect(snapAfterRebuy.stacks[player.playerId]).toBe(2000);

    // Verify transactions ledger includes both chip_request and rebuy entries
    const txs = snapAfterRebuy.transactions ?? [];
    const requestTx = txs.find((t) => t.playerId === player.playerId && t.type === "chip_request");
    const rebuyTx = txs.find((t) => t.playerId === player.playerId && t.type === "rebuy");

    expect(requestTx).toBeDefined();
    expect(requestTx?.amount).toBe(2000);
    expect(requestTx?.status).toBe("approved");

    expect(rebuyTx).toBeDefined();
    expect(rebuyTx?.amount).toBe(2000);
    expect(rebuyTx?.balanceAfter).toBe(2000);

    // Net PNL: stack (2000) - totalBuyIn (5000 initial + 2000 rebuy = 7000) = -5000 (accurate loss from setting stack to 0)
    const totalBuyIn = snapAfterRebuy.totalBuyIns[player.playerId] ?? 0;
    expect(totalBuyIn).toBe(7000);
    const netPnl = (snapAfterRebuy.stacks[player.playerId] ?? 0) - totalBuyIn;
    expect(netPnl).toBe(-5000);

    host.disconnect();
    player.disconnect();
  });

  it("does not grant chips twice and buying chips does not increment round number", async () => {
    const host = new TestClient("Host");
    const player = new TestClient("Player");
    await host.connect(serverUrl);
    await player.connect(serverUrl);

    const { roomCode } = await host.createRoom({
      displayName: "Alice",
      avatarId: "av-1",
    });

    await player.joinRoom({
      code: roomCode,
      displayName: "Bob",
      avatarId: "av-2",
    });

    // Bob requests 500 chips
    await player.rebuyRequest(500);

    // Snapshot should show pending request and stack unchanged (still 5000)
    const snapPending = await player.waitForSnapshot(
      (s) => s.transactions?.some((t) => t.type === "chip_request" && t.amount === 500) ?? false,
    );
    expect(snapPending.stacks[player.playerId]).toBe(5000);
    const pendingReq = snapPending.transactions?.find(
      (t) => t.type === "chip_request" && t.amount === 500,
    );
    expect(pendingReq?.status).toBe("pending");

    // Host approves once
    await host.hostApproveRebuy(player.playerId, 500);

    const snapApproved = await player.waitForSnapshot((s) => s.stacks[player.playerId] === 5500);
    expect(snapApproved.stacks[player.playerId]).toBe(5500);

    // Host attempts duplicate approval (e.g. rapid double click)
    await host.hostApproveRebuy(player.playerId, 500);

    // Wait a brief moment to ensure no second rebuy is granted
    await new Promise((r) => setTimeout(r, 100));
    expect(player.latestSnapshot?.stacks[player.playerId]).toBe(5500);

    // Verify roundNumber has NOT incremented (buying chips is not a round)
    expect(player.latestSnapshot?.roundNumber).toBe(0);

    host.disconnect();
    player.disconnect();
  });

  it("notifies table on chip request, grant, and host wallet additions", async () => {
    const host = new TestClient("Host");
    const player = new TestClient("Player");
    await host.connect(serverUrl);
    await player.connect(serverUrl);

    const { roomCode } = await host.createRoom({
      displayName: "Alice",
      avatarId: "av-1",
    });

    await player.joinRoom({
      code: roomCode,
      displayName: "Bob",
      avatarId: "av-2",
    });

    // 1. Bob requests 1000 chips
    await player.rebuyRequest(1000);

    // Both host and player receive chip_request notification
    await new Promise((r) => setTimeout(r, 100));
    const hostReqNotif = host.receivedNotifications.find((n) => n.type === "chip_request");
    const playerReqNotif = player.receivedNotifications.find((n) => n.type === "chip_request");
    expect(hostReqNotif).toBeDefined();
    expect(playerReqNotif).toBeDefined();
    expect(hostReqNotif?.message).toContain("Bob requested 1,000 chips");

    // 2. Host approves rebuy
    await host.hostApproveRebuy(player.playerId, 1000);
    await player.waitForSnapshot((s) => s.stacks[player.playerId] === 6000);

    const hostApproveNotif = host.receivedNotifications.find(
      (n) => n.type === "chip_approved" && n.amount === 1000,
    );
    const playerApproveNotif = player.receivedNotifications.find(
      (n) => n.type === "chip_approved" && n.amount === 1000,
    );
    expect(hostApproveNotif).toBeDefined();
    expect(playerApproveNotif).toBeDefined();
    expect(playerApproveNotif?.message).toContain("Bob was granted 1,000 chips");

    // 3. Host adds 500 chips to Bob's wallet via adjustChips
    await host.adjustChips(player.playerId, "add", 500);
    const snapAfterAdjust = await player.waitForSnapshot((s) => s.stacks[player.playerId] === 6500);
    expect(snapAfterAdjust.stacks[player.playerId]).toBe(6500);
    expect(snapAfterAdjust.rebuys?.[player.playerId]).toBe(1500); // 1000 rebuy + 500 host added

    // Notification broadcast to table
    const hostAdjustNotif = host.receivedNotifications.find(
      (n) => n.type === "chip_approved" && n.amount === 500,
    );
    const playerAdjustNotif = player.receivedNotifications.find(
      (n) => n.type === "chip_approved" && n.amount === 500,
    );
    expect(hostAdjustNotif).toBeDefined();
    expect(playerAdjustNotif).toBeDefined();
    expect(playerAdjustNotif?.message).toContain("Bob was granted ₹500 chips by host");

    // Ledger records adjustment transaction
    const adjustTx = snapAfterAdjust.transactions?.find(
      (t) => t.playerId === player.playerId && t.type === "adjustment" && t.amount === 500,
    );
    expect(adjustTx).toBeDefined();
    expect(adjustTx?.balanceAfter).toBe(6500);

    host.disconnect();
    player.disconnect();
  });
});
