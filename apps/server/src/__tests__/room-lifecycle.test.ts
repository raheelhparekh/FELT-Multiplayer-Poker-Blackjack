import type { Participant } from "@felt/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AppInstance, createServer } from "../server.js";
import { TestClient } from "./test-client.js";

describe("Room Lifecycle & Presence Integration", () => {
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

  it("creates a room with an unambiguous 6-character code and registers host", async () => {
    const host = new TestClient("Host");
    await host.connect(serverUrl);

    const { roomCode, participant, token } = await host.createRoom({
      displayName: "Alice",
      avatarId: "avatar-1",
    });

    expect(roomCode).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    expect(participant.displayName).toBe("Alice");
    expect(participant.role).toBe("host");
    expect(participant.isHost).toBe(true);
    expect(token).toBeTruthy();

    const snapshot = await host.waitForSnapshot((s) => s.roomCode === roomCode);
    expect(snapshot.participants.length).toBe(1);
    expect(snapshot.participants[0]!.id).toBe(participant.id);

    host.disconnect();
  });

  it("allows players to join with a room code, sit down, and stand up", async () => {
    const host = new TestClient("Host");
    const player1 = new TestClient("Player1");
    await host.connect(serverUrl);
    await player1.connect(serverUrl);

    const { roomCode } = await host.createRoom({
      displayName: "HostAlice",
      avatarId: "av-1",
    });

    const joinRes = await player1.joinRoom({
      code: roomCode,
      displayName: "Bob",
      avatarId: "av-2",
    });

    expect(joinRes.participant.displayName).toBe("Bob");
    expect(joinRes.participant.role).toBe("spectator");

    // Wait for Bob to see himself in the room
    await player1.waitForSnapshot((s) => s.participants.length === 2);

    // Bob sits at seat 1
    await player1.sit(1);
    const snapAfterSit = await player1.waitForSnapshot(
      (s) => s.participants.find((p: Participant) => p.id === player1.playerId)?.seat === 1,
    );
    const bob = snapAfterSit.participants.find((p: Participant) => p.id === player1.playerId);
    expect(bob?.seat).toBe(1);
    expect(bob?.role).toBe("player");

    // Another player tries to sit in the same seat -> error
    const player2 = new TestClient("Player2");
    await player2.connect(serverUrl);
    await player2.joinRoom({
      code: roomCode,
      displayName: "Charlie",
      avatarId: "av-3",
    });

    await expect(player2.sit(1)).rejects.toThrow(/already occupied/);

    // Charlie sits at seat 2
    await player2.sit(2);
    const snapAfterCharlie = await player2.waitForSnapshot(
      (s) => s.participants.find((p: Participant) => p.id === player2.playerId)?.seat === 2,
    );
    expect(snapAfterCharlie.participants.find((p: Participant) => p.id === player2.playerId)?.seat).toBe(2);

    // Bob stands up
    await player1.stand();
    const snapAfterStand = await player1.waitForSnapshot(
      (s) => s.participants.find((p: Participant) => p.id === player1.playerId)?.seat === null,
    );
    expect(snapAfterStand.participants.find((p: Participant) => p.id === player1.playerId)?.seat).toBeNull();

    host.disconnect();
    player1.disconnect();
    player2.disconnect();
  });

  it("enforces room password protection", async () => {
    const host = new TestClient("Host");
    await host.connect(serverUrl);

    const { roomCode } = await host.createRoom({
      displayName: "Alice",
      avatarId: "av-1",
      password: "secret-password",
    });

    const visitor = new TestClient("Visitor");
    await visitor.connect(serverUrl);

    // Wrong password fails
    await expect(
      visitor.joinRoom({
        code: roomCode,
        displayName: "Eve",
        avatarId: "av-2",
        password: "wrong",
      }),
    ).rejects.toThrow(/password/i);

    // Correct password succeeds
    const joined = await visitor.joinRoom({
      code: roomCode,
      displayName: "Eve",
      avatarId: "av-2",
      password: "secret-password",
    });
    expect(joined.participant.displayName).toBe("Eve");

    host.disconnect();
    visitor.disconnect();
  });

  it("handles disconnect and reconnect preserving stack and seat", async () => {
    const host = new TestClient("Host");
    const player = new TestClient("Player");
    await host.connect(serverUrl);
    await player.connect(serverUrl);

    const { roomCode } = await host.createRoom({
      displayName: "Alice",
      avatarId: "av-1",
    });

    const { token, participant } = await player.joinRoom({
      code: roomCode,
      displayName: "Bob",
      avatarId: "av-2",
    });

    await player.sit(3);
    await player.waitForSnapshot(
      (s) => s.participants.find((p: Participant) => p.id === participant.id)?.seat === 3,
    );

    // Bob disconnects
    player.disconnect();

    // Host sees Bob is disconnected
    await host.waitForSnapshot((s) => {
      const p = s.participants.find((x: Participant) => x.id === participant.id);
      return p !== undefined && !p.isConnected && p.seat === 3;
    });

    // Bob reconnects with token
    const reconnectedPlayer = new TestClient("BobReconnected");
    await reconnectedPlayer.connect(serverUrl);

    const rejoinRes = await reconnectedPlayer.joinRoom({
      code: roomCode,
      displayName: "Bob",
      avatarId: "av-2",
      token,
    });

    expect(rejoinRes.isReconnect).toBe(true);
    expect(rejoinRes.participant.id).toBe(participant.id);
    expect(rejoinRes.participant.seat).toBe(3);

    // Check snapshot
    const reconnectedSnap = await reconnectedPlayer.waitForSnapshot(
      (s) => s.participants.find((p: Participant) => p.id === participant.id)?.isConnected === true,
    );
    expect(reconnectedSnap.participants.find((p: Participant) => p.id === participant.id)?.seat).toBe(3);

    host.disconnect();
    reconnectedPlayer.disconnect();
  });

  it("auto-transfers host when host disconnects", async () => {
    const host = new TestClient("Host");
    const player1 = new TestClient("Player1");
    await host.connect(serverUrl);
    await player1.connect(serverUrl);

    const { roomCode } = await host.createRoom({
      displayName: "OriginalHost",
      avatarId: "av-1",
    });

    await player1.joinRoom({
      code: roomCode,
      displayName: "NextHost",
      avatarId: "av-2",
    });

    await player1.sit(1);
    await player1.waitForSnapshot((s) => s.participants.length === 2);

    // Original host disconnects
    host.disconnect();

    // Player1 should become the new host
    const snap = await player1.waitForSnapshot((s) => s.hostId === player1.playerId);
    expect(snap.hostId).toBe(player1.playerId);
    const p1InSnap = snap.participants.find((p: Participant) => p.id === player1.playerId);
    expect(p1InSnap?.isHost).toBe(true);

    player1.disconnect();
  });
});
