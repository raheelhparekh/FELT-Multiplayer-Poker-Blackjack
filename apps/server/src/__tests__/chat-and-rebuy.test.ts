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

    host.disconnect();
    player.disconnect();
  });
});
