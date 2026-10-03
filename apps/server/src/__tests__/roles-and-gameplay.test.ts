import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AppInstance, createServer } from "../server.js";
import { TestClient } from "./test-client.js";

describe("Roles, Gameplay & Hidden Info Audit", () => {
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

  it("plays a full multi-client round: 3 players + dealer + spectator with hidden-info audit", async () => {
    const host = new TestClient("Host");
    const dealerClient = new TestClient("Dealer");
    const p1 = new TestClient("Player1");
    const p2 = new TestClient("Player2");
    const p3 = new TestClient("Player3");
    const spectator = new TestClient("Spectator");

    const allClients = [host, dealerClient, p1, p2, p3, spectator];
    for (const c of allClients) {
      await c.connect(serverUrl);
    }

    // 1. Host creates room
    const { roomCode } = await host.createRoom({
      displayName: "HostAlice",
      avatarId: "av-host",
    });

    // 2. Others join
    await dealerClient.joinRoom({
      code: roomCode,
      displayName: "DanDealer",
      avatarId: "av-dealer",
    });
    await p1.joinRoom({ code: roomCode, displayName: "Priya", avatarId: "av-p1" });
    await p2.joinRoom({ code: roomCode, displayName: "Raj", avatarId: "av-p2" });
    await p3.joinRoom({ code: roomCode, displayName: "Meera", avatarId: "av-p3" });
    await spectator.joinRoom({ code: roomCode, displayName: "SamSpectator", avatarId: "av-spec" });

    // 3. Assign dealer
    await host.setDealer(dealerClient.playerId);
    await host.waitForSnapshot((s) => s.dealerId === dealerClient.playerId);

    // 4. Seat players 1, 2, 3
    await p1.sit(1);
    await p2.sit(2);
    await p3.sit(3);
    await host.waitForSnapshot(
      (s) =>
        s.participants.find((p) => p.id === p1.playerId)?.seat === 1 &&
        s.participants.find((p) => p.id === p2.playerId)?.seat === 2 &&
        s.participants.find((p) => p.id === p3.playerId)?.seat === 3,
    );

    // 5. Host starts session -> transitions to betting
    await host.startSession();
    await p1.waitForPhase("betting");

    // 6. Players place bets
    await p1.betAdd(100);
    await p1.betLock();

    await p2.betAdd(200);
    await p2.betLock();

    await p3.betAdd(50);
    await p3.betLock();

    await host.waitForSnapshot((s) => Object.keys(s.stacks).length >= 3);

    // 7. Dealer deals
    await dealerClient.dealerDeal();

    // Wait until dealing is complete for ALL clients
    await Promise.all(
      allClients.map((c) =>
        c.waitForSnapshot((s) => s.phase !== "betting" && s.phase !== "dealing"),
      ),
    );

    // HIDDEN INFO CHECK 1: Before hole card is revealed, hole card must be hidden for EVERYONE
    // including the dealer and spectators!
    if (p1.latestSnapshot?.phase === "player_turns") {
      for (const client of allClients) {
        const snap = client.latestSnapshot!;
        expect(snap.dealerHand).toBeTruthy();
        const holeCard = snap.dealerHand?.cards[1];
        expect(holeCard?.hidden).toBe(true);
        expect(holeCard && "card" in holeCard).toBe(false);
      }

      // 8. Play turns left to right
      while (true) {
        const currentView = p1.latestSnapshot!;
        if (currentView.phase !== "player_turns") break;

        const activeHand = currentView.hands.find((h) => h.id === currentView.activeHandId);
        if (!activeHand) break;

        const activeClient = allClients.find((c) => c.playerId === activeHand.playerId);
        if (activeClient) {
          // Player stands
          await activeClient.playStand(activeHand.id);
        } else {
          break;
        }

        // Wait for all clients to sync next state
        await new Promise((r) => setTimeout(r, 20));
      }
    }

    // Wait for round summary across all clients
    await Promise.all(
      allClients.map((c) => c.waitForSnapshot((s) => s.phase === "round_summary", 5000)),
    );
    const summaryView = p1.latestSnapshot!;
    expect(summaryView.phase).toBe("round_summary");

    // In round_summary, dealer's hole card is now revealed
    const revealedHole = summaryView.dealerHand?.cards[1];
    expect(revealedHole?.hidden).toBe(false);
    expect(revealedHole && "card" in revealedHole).toBe(true);

    // HIDDEN INFO AUDIT across ALL snapshots received during the game:
    for (const client of allClients) {
      for (const snap of client.receivedSnapshots) {
        const view = snap.data;
        const serialized = JSON.stringify(view);

        // Invariant: dealerHasBlackjack must NEVER appear in client view
        expect(serialized).not.toContain("dealerHasBlackjack");

        // Invariant: shoe cards must not be serialized as an undealt array
        expect(serialized).not.toContain('"shoe":');

        // Invariant: any card with hidden: true must never have a "card" property
        const allHands = [...view.hands, ...(view.dealerHand ? [view.dealerHand] : [])];
        for (const h of allHands) {
          for (const cardSlot of h.cards) {
            if (cardSlot.hidden) {
              expect("card" in cardSlot).toBe(false);
            }
          }
        }
      }
    }

    // 9. Dealer starts next round
    await dealerClient.dealerNextRound();
    await p1.waitForPhase("betting");
    expect(p1.latestSnapshot?.roundNumber).toBe(2);

    for (const c of allClients) {
      c.disconnect();
    }
  });

  it("supports host controls: kicking a player, dealer swap, and chip adjustments", async () => {
    const host = new TestClient("Host");
    const player1 = new TestClient("Player1");
    const player2 = new TestClient("Player2");

    await host.connect(serverUrl);
    await player1.connect(serverUrl);
    await player2.connect(serverUrl);

    const { roomCode } = await host.createRoom({
      displayName: "Host",
      avatarId: "av-host",
    });

    await player1.joinRoom({ code: roomCode, displayName: "Alice", avatarId: "av-p1" });
    await player2.joinRoom({ code: roomCode, displayName: "Bob", avatarId: "av-p2" });

    // Host adjusts player1's chips
    await host.adjustChips(player1.playerId, "add", 1500);
    const snapAfterAdjust = await player1.waitForSnapshot(
      (s) => s.stacks[player1.playerId] === 6500,
    );
    expect(snapAfterAdjust.stacks[player1.playerId]).toBe(6500);

    // Activity log contains the adjustment
    await host.waitForSnapshot((_s) =>
      host.receivedActivities.some((a) => a.text.includes("Host added 1,500 chips")),
    );

    // Host assigns Player1 as dealer
    await host.setDealer(player1.playerId);
    await player1.waitForSnapshot((s) => s.dealerId === player1.playerId);
    expect(player1.latestSnapshot?.dealerId).toBe(player1.playerId);

    // Host swaps dealer to Player2
    await host.setDealer(player2.playerId);
    await player2.waitForSnapshot((s) => s.dealerId === player2.playerId);
    expect(player2.latestSnapshot?.dealerId).toBe(player2.playerId);

    // Host kicks Player1
    await host.kick(player1.playerId);

    // Player1 should receive kick error and be disconnected
    await host.waitForSnapshot((s) => !s.participants.some((p) => p.id === player1.playerId));

    // Player1 reconnect attempt should be rejected with BANNED
    const bannedClient = new TestClient("BannedPlayer1");
    await bannedClient.connect(serverUrl);
    await expect(
      bannedClient.joinRoom({
        code: roomCode,
        displayName: "Alice",
        avatarId: "av-p1",
        token: player1.token,
      }),
    ).rejects.toThrow(/banned/i);

    bannedClient.disconnect();
    host.disconnect();
    player1.disconnect();
    player2.disconnect();
  });

  it("handles mid-turn player disconnect with auto-stand", async () => {
    const host = new TestClient("Host");
    const dealer = new TestClient("Dealer");
    const player = new TestClient("Player");

    await host.connect(serverUrl);
    await dealer.connect(serverUrl);
    await player.connect(serverUrl);

    // Configure a short 1-second action timer for test
    const { roomCode } = await host.createRoom({
      displayName: "Host",
      avatarId: "av-h",
      config: {
        ...app.roomManager.createRoom().config,
        actionTimerSec: 1, // 1 second timer for fast test
        betTimerSec: 30,
      },
    });

    await dealer.joinRoom({ code: roomCode, displayName: "Dealer", avatarId: "av-d" });
    await player.joinRoom({ code: roomCode, displayName: "Player", avatarId: "av-p" });

    await host.setDealer(dealer.playerId);
    await player.sit(1);
    await host.waitForSnapshot(
      (s) => s.participants.find((p) => p.id === player.playerId)?.seat === 1,
    );

    await host.startSession();
    await player.waitForPhase("betting");

    await player.betAdd(100);
    await player.betLock();
    await dealer.dealerDeal();

    const view = await player.waitForSnapshot(
      (s) => s.phase !== "betting" && s.phase !== "dealing",
    );

    if (view.phase === "player_turns") {
      // Disconnect the player right on their turn
      player.disconnect();

      // Within actionTimer (1s), auto-stand should resolve the turn and advance to dealer_turn or round_summary
      const postAutoStandView = await host.waitForSnapshot(
        (s) => s.phase === "dealer_turn" || s.phase === "round_summary",
        4000,
      );
      expect(
        postAutoStandView.phase === "dealer_turn" || postAutoStandView.phase === "round_summary",
      ).toBe(true);
    }

    host.disconnect();
    dealer.disconnect();
  });
});
