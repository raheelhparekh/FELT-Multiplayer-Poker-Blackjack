import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AppInstance, createServer } from "../server.js";
import { TestClient } from "./test-client.js";
import { scanForPokerLeaks, type ClientPokerGameView } from "@felt/shared";

describe("Poker Server Gameplay & Hidden Info Audit", () => {
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

  it("creates a poker room, deals hand, enforces hidden info privacy across players & spectator", async () => {
    const host = new TestClient("HostAlice");
    const bob = new TestClient("Bob");
    const charlie = new TestClient("Charlie");
    const spectator = new TestClient("SamSpectator");

    const clients = [host, bob, charlie, spectator];
    for (const c of clients) {
      await c.connect(serverUrl);
    }

    // 1. Create poker room
    const { roomCode } = await host.createRoom({
      displayName: "Alice",
      avatarId: "av-alice",
      gameType: "poker",
      buyIn: 1000,
    });

    // 2. Others join
    await bob.joinRoom({ code: roomCode, displayName: "Bob", avatarId: "av-bob", buyIn: 1000 });
    await charlie.joinRoom({ code: roomCode, displayName: "Charlie", avatarId: "av-charlie", buyIn: 1000 });
    await spectator.joinRoom({ code: roomCode, displayName: "Sam", avatarId: "av-spec" });

    // 3. Sit Alice (seat 1), Bob (seat 2), Charlie (seat 3)
    await host.sit(1);
    await bob.sit(2);
    await charlie.sit(3);

    await host.waitForSnapshot((s: any) => {
      const p = s.players ?? [];
      return p.length === 3;
    });

    // 4. Host starts session
    await host.startSession();

    // Wait until hand starts and cards are dealt for ALL clients
    await Promise.all(
      clients.map((c) =>
        c.waitForSnapshot((s: any) => s.phase === "betting" && s.handNumber === 1),
      ),
    );

    // 5. P0 Hidden Info Audit on preflop snapshots
    for (const c of [host, bob, charlie]) {
      const snap = c.latestSnapshot as ClientPokerGameView;
      expect(snap.gameType).toBe("poker");
      expect(snap.phase).toBe("betting");
      expect(snap.street).toBe("preflop");

      // Verify leak scanner returns 0 violations
      const violations = scanForPokerLeaks(snap);
      expect(violations).toEqual([]);

      // Verify the client only sees their own hole cards
      for (const p of snap.players) {
        if (p.id === c.playerId) {
          expect(p.cards.length).toBe(2);
          expect(p.cards[0].hidden).toBe(false);
          expect(p.cards[0].card).toBeDefined();
          expect(p.cards[1].hidden).toBe(false);
          expect(p.cards[1].card).toBeDefined();
        } else {
          expect(p.cards.length).toBe(2);
          expect(p.cards[0].hidden).toBe(true);
          expect(p.cards[0].card).toBeUndefined();
          expect(p.cards[1].hidden).toBe(true);
          expect(p.cards[1].card).toBeUndefined();
        }
      }
    }

    // Spectator audit: all hole cards are hidden
    const specSnap = spectator.latestSnapshot as ClientPokerGameView;
    expect(scanForPokerLeaks(specSnap)).toEqual([]);
    for (const p of specSnap.players) {
      expect(p.cards.length).toBe(2);
      expect(p.cards[0].hidden).toBe(true);
      expect(p.cards[0].card).toBeUndefined();
      expect(p.cards[1].hidden).toBe(true);
      expect(p.cards[1].card).toBeUndefined();
    }

    for (const c of clients) {
      c.disconnect();
    }
  });

  it("plays a full hand through showdown and verifies chip conservation", async () => {
    const host = new TestClient("Alice");
    const bob = new TestClient("Bob");

    await host.connect(serverUrl);
    await bob.connect(serverUrl);

    // Create heads-up poker room
    const { roomCode } = await host.createRoom({
      displayName: "Alice",
      avatarId: "av-alice",
      gameType: "poker",
      buyIn: 1000,
    });

    await bob.joinRoom({ code: roomCode, displayName: "Bob", avatarId: "av-bob", buyIn: 1000 });

    await host.sit(1);
    await bob.sit(2);

    await host.waitForSnapshot((s: any) => (s.players ?? []).length === 2);
    await host.startSession();

    await Promise.all([
      host.waitForSnapshot((s: any) => s.phase === "betting" && s.handNumber === 1),
      bob.waitForSnapshot((s: any) => s.phase === "betting" && s.handNumber === 1),
    ]);

    // Initial total chips = 2000
    const getClient = (id: string) => (id === host.playerId ? host : bob);

    // Play until hand reaches hand_summary
    for (let round = 0; round < 25; round++) {
      const snap = host.latestSnapshot as ClientPokerGameView;
      if (snap.phase === "hand_summary") break;
      if (!snap.toActPlayerId) break;

      const activeClient = getClient(snap.toActPlayerId);
      const clientSnap = (await activeClient.waitForSnapshot(
        (s: any) => s.toActPlayerId === activeClient.playerId,
      )) as ClientPokerGameView;
      const legalActions = clientSnap.myLegalActions;

      if (legalActions.includes("check")) {
        await activeClient.pokerCheck();
      } else if (legalActions.includes("call")) {
        await activeClient.pokerCall();
      } else {
        await activeClient.pokerFold();
      }

      await host.waitForSnapshot((s: any) => s.seq > snap.seq);
    }

    // Wait for hand_summary
    const finalSnap = await host.waitForSnapshot((s: any) => s.phase === "hand_summary");
    expect(finalSnap.phase).toBe("hand_summary");
    expect(finalSnap.winners).toBeDefined();
    expect(finalSnap.winners!.length).toBeGreaterThan(0);

    // Verify chip conservation: Alice stack + Bob stack === 20000 (starting stack 10000 each)
    const totalChips = finalSnap.players.reduce((sum: number, p: any) => sum + p.stack, 0);
    expect(totalChips).toBe(20000);

    host.disconnect();
    bob.disconnect();
  });

  it("awards pot to remaining player when everyone else folds", async () => {
    const alice = new TestClient("Alice");
    const bob = new TestClient("Bob");

    await alice.connect(serverUrl);
    await bob.connect(serverUrl);

    const { roomCode } = await alice.createRoom({
      displayName: "Alice",
      avatarId: "av-alice",
      gameType: "poker",
      buyIn: 1000,
    });

    await bob.joinRoom({ code: roomCode, displayName: "Bob", avatarId: "av-bob", buyIn: 1000 });

    await alice.sit(1);
    await bob.sit(2);

    await alice.waitForSnapshot((s: any) => (s.players ?? []).length === 2);
    await alice.startSession();

    await alice.waitForSnapshot((s: any) => s.phase === "betting");

    // The player to act folds immediately
    const toActId = (alice.latestSnapshot as ClientPokerGameView).toActPlayerId!;
    const foldingClient = toActId === alice.playerId ? alice : bob;
    await foldingClient.pokerFold();

    const summarySnap = await alice.waitForSnapshot((s: any) => s.phase === "hand_summary");
    expect(summarySnap.phase).toBe("hand_summary");
    expect(summarySnap.winners).toBeDefined();
    expect(summarySnap.winners!.length).toBe(1);

    const winnerId = summarySnap.winners![0].playerId;
    expect(winnerId).not.toBe(foldingClient.playerId);

    const totalChips = summarySnap.players.reduce((sum: number, p: any) => sum + p.stack, 0);
    expect(totalChips).toBe(20000);

    // Verify PNL & ledger: transactions recorded for winners & losers
    expect(summarySnap.transactions).toBeDefined();
    expect(summarySnap.transactions!.length).toBeGreaterThan(0);
    const winTx = summarySnap.transactions!.find((tx: any) => tx.type === "round_win");
    expect(winTx).toBeDefined();
    expect(winTx!.playerId).toBe(winnerId);

    // Verify stacks and totalBuyIns are present on view
    expect(summarySnap.stacks).toBeDefined();
    expect(summarySnap.stacks[winnerId]).toBe(summarySnap.players.find((p: any) => p.id === winnerId)!.stack);
    expect(summarySnap.totalBuyIns).toBeDefined();
    expect(summarySnap.totalBuyIns[winnerId]).toBe(10000);

    alice.disconnect();
    bob.disconnect();
  });

  it("deals hole cards immediately face-up to owner without blind card logic", async () => {
    const alice = new TestClient("Alice");
    const bob = new TestClient("Bob");

    await alice.connect(serverUrl);
    await bob.connect(serverUrl);

    const { roomCode } = await alice.createRoom({
      displayName: "Alice",
      avatarId: "av-alice",
      gameType: "poker",
      buyIn: 1000,
    });

    await bob.joinRoom({ code: roomCode, displayName: "Bob", avatarId: "av-bob", buyIn: 1000 });

    await alice.sit(1);
    await bob.sit(2);

    await alice.waitForSnapshot((s: any) => (s.players ?? []).length === 2);
    await alice.startSession();

    const [aliceSnap, bobSnap] = await Promise.all([
      alice.waitForSnapshot((s: any) => s.phase === "betting"),
      bob.waitForSnapshot((s: any) => s.phase === "betting"),
    ]);

    const aliceSelf = (aliceSnap as ClientPokerGameView).players.find((p) => p.id === alice.playerId)!;
    expect(aliceSelf.cards[0]!.hidden).toBe(false);
    expect("hasSeenCards" in aliceSelf).toBe(false);

    const aliceInBobView = (bobSnap as ClientPokerGameView).players.find((p) => p.id === alice.playerId)!;
    expect(aliceInBobView.cards[0]!.hidden).toBe(true);
    expect("card" in aliceInBobView.cards[0]!).toBe(false);

    alice.disconnect();
    bob.disconnect();
  });

  it("updates poker host settings and enforces poker validation rules", async () => {
    const alice = new TestClient("Alice");
    await alice.connect(serverUrl);

    await alice.createRoom({
      displayName: "Alice",
      avatarId: "av-alice",
      gameType: "poker",
      buyIn: 1000,
    });

    // Verify initial default poker config
    const initialSnap = alice.latestSnapshot as ClientPokerGameView;
    expect(initialSnap.config.smallBlind).toBe(25);
    expect(initialSnap.config.bigBlind).toBe(50);
    expect(initialSnap.config.rebuyRequiresHostApproval).toBe(true);

    // Host updates poker settings
    await alice.updateConfig({
      smallBlind: 50,
      bigBlind: 100,
      minBuyIn: 500,
      maxBuyIn: 5000,
      maxPlayerSeats: 8,
      tableTheme: "royal-blue",
      rebuyRequiresHostApproval: false,
    });

    const updatedSnap = (await alice.waitForSnapshot(
      (s: any) => s.config?.smallBlind === 50 && s.config?.tableTheme === "royal-blue",
    )) as ClientPokerGameView;

    expect(updatedSnap.config.smallBlind).toBe(50);
    expect(updatedSnap.config.bigBlind).toBe(100);
    expect(updatedSnap.config.minBuyIn).toBe(500);
    expect(updatedSnap.config.maxBuyIn).toBe(5000);
    expect((updatedSnap.config as any).maxPlayerSeats).toBe(8);
    expect(updatedSnap.config.rebuyRequiresHostApproval).toBe(false);

    // Illegal config: smallBlind >= bigBlind
    await expect(
      alice.updateConfig({
        smallBlind: 200,
        bigBlind: 100,
      }),
    ).rejects.toThrow();

    alice.disconnect();
  });

  it("enforces host control over buy-ins/rebuys with pending queue, decline and approve", async () => {
    const alice = new TestClient("Alice");
    const bob = new TestClient("Bob");

    await alice.connect(serverUrl);
    await bob.connect(serverUrl);

    const { roomCode } = await alice.createRoom({
      displayName: "Alice",
      avatarId: "av-alice",
      gameType: "poker",
      buyIn: 1000,
    });

    await bob.joinRoom({ code: roomCode, displayName: "Bob", avatarId: "av-bob", buyIn: 1000 });
    await alice.sit(1);
    await bob.sit(2);

    await alice.waitForSnapshot((s: any) => (s.players ?? []).length === 2);

    // Check that host approval is required by default
    const snap = alice.latestSnapshot as ClientPokerGameView;
    expect(snap.config.rebuyRequiresHostApproval).toBe(true);

    // Bob requests a rebuy of 500 chips
    await bob.rebuyRequest(500);

    // Wait for Alice (Host) to receive snapshot with pending chip_request
    const hostSnapWithPending = await alice.waitForSnapshot((s: any) => {
      return (s.transactions ?? []).some(
        (tx: any) => tx.playerId === bob.playerId && tx.type === "chip_request" && tx.status === "pending",
      );
    });

    // Bob's stack must NOT have increased yet!
    expect(hostSnapWithPending.stacks[bob.playerId]).toBe(10000);

    // Host declines the request
    await alice.hostRejectRebuy(bob.playerId);

    // Wait for transaction to become rejected
    const hostSnapAfterReject = await alice.waitForSnapshot((s: any) => {
      return (s.transactions ?? []).some(
        (tx: any) => tx.playerId === bob.playerId && tx.type === "chip_request" && tx.status === "rejected",
      );
    });

    // Bob's stack is still 10000
    expect(hostSnapAfterReject.stacks[bob.playerId]).toBe(10000);

    // Bob requests 1500 chips
    await bob.rebuyRequest(1500);

    await alice.waitForSnapshot((s: any) => {
      return (s.transactions ?? []).some(
        (tx: any) => tx.playerId === bob.playerId && tx.type === "chip_request" && tx.status === "pending",
      );
    });

    // Host approves the request!
    await alice.hostApproveRebuy(bob.playerId, 1500);

    // Wait for Bob's stack to become 11500 (10000 + 1500)
    const hostSnapAfterApprove = await alice.waitForSnapshot((s: any) => {
      return s.stacks[bob.playerId] === 11500;
    });

    expect(hostSnapAfterApprove.stacks[bob.playerId]).toBe(11500);

    alice.disconnect();
    bob.disconnect();
  });

  it("CRITICAL INFORMATION LEAK SAFEGUARD: fold win does NOT leak winner hole cards to opponent across WebSocket", async () => {
    const alice = new TestClient("Alice");
    const bob = new TestClient("Bob");

    await alice.connect(serverUrl);
    await bob.connect(serverUrl);

    const { roomCode } = await alice.createRoom({
      displayName: "Alice",
      avatarId: "av-alice",
      gameType: "poker",
      buyIn: 1000,
    });

    await bob.joinRoom({ code: roomCode, displayName: "Bob", avatarId: "av-bob", buyIn: 1000 });

    await alice.sit(1);
    await bob.sit(2);

    await alice.waitForSnapshot((s: any) => (s.players ?? []).length === 2);
    await alice.startSession();

    // Wait until hand starts
    await Promise.all([
      alice.waitForSnapshot((s: any) => s.phase === "betting" && s.handNumber === 1),
      bob.waitForSnapshot((s: any) => s.phase === "betting" && s.handNumber === 1),
    ]);

    // In heads-up preflop, button (SB) acts first.
    // Determine who has the turn
    const initialSnap = alice.latestSnapshot as ClientPokerGameView;
    const toActId = initialSnap.toActPlayerId!;
    const firstClient = toActId === alice.playerId ? alice : bob;
    const otherClient = toActId === alice.playerId ? bob : alice;

    // First player folds immediately
    await firstClient.pokerFold();

    // Wait for hand_summary on both clients
    const summarySnapOther = await otherClient.waitForSnapshot((s: any) => s.phase === "hand_summary");
    const summarySnapFirst = await firstClient.waitForSnapshot((s: any) => s.phase === "hand_summary");

    // The winner is otherClient (since firstClient folded)
    expect(summarySnapOther.winners?.[0]?.playerId).toBe(otherClient.playerId);
    expect(summarySnapOther.winners?.[0]?.handName).toBe("All other players folded");

    // CRITICAL SECURITY ASSERTION:
    // firstClient (the folded player) CANNOT see the winner's hole cards!
    const winnerPlayerInFirstClientView = summarySnapFirst.players.find((p) => p.id === otherClient.playerId)!;
    expect(winnerPlayerInFirstClientView.cards.length).toBe(2);
    expect(winnerPlayerInFirstClientView.cards[0].hidden).toBe(true);
    expect(winnerPlayerInFirstClientView.cards[0].card).toBeUndefined();
    expect(winnerPlayerInFirstClientView.cards[1].hidden).toBe(true);
    expect(winnerPlayerInFirstClientView.cards[1].card).toBeUndefined();

    // Verify zero leaks in scanForPokerLeaks
    expect(scanForPokerLeaks(summarySnapFirst)).toEqual([]);

    alice.disconnect();
    bob.disconnect();
  });

  it("mid-hand joiner does NOT stall the hand or get assigned a turn", async () => {
    const alice = new TestClient("Alice");
    const bob = new TestClient("Bob");
    const charlie = new TestClient("Charlie"); // joins mid-hand

    await alice.connect(serverUrl);
    await bob.connect(serverUrl);
    await charlie.connect(serverUrl);

    const { roomCode } = await alice.createRoom({
      displayName: "Alice",
      avatarId: "av-alice",
      gameType: "poker",
      buyIn: 1000,
    });

    await bob.joinRoom({ code: roomCode, displayName: "Bob", avatarId: "av-bob", buyIn: 1000 });

    await alice.sit(1);
    await bob.sit(2);

    await alice.waitForSnapshot((s: any) => (s.players ?? []).length === 2);
    await alice.startSession();

    // Wait until hand is in progress (preflop betting)
    await Promise.all([
      alice.waitForSnapshot((s: any) => s.phase === "betting" && s.handNumber === 1),
      bob.waitForSnapshot((s: any) => s.phase === "betting" && s.handNumber === 1),
    ]);

    // Charlie joins and takes a seat mid-hand
    await charlie.joinRoom({ code: roomCode, displayName: "Charlie", avatarId: "av-charlie", buyIn: 1000 });
    await charlie.sit(3);

    // Wait for Charlie to appear in state
    await alice.waitForSnapshot((s: any) => (s.players ?? []).length === 3);

    // Charlie should be marked hasFolded=true with no cards (mid-hand joiner)
    const snapForAlice = alice.latestSnapshot as ClientPokerGameView;
    const charlieInView = snapForAlice.players.find((p) => p.id === charlie.playerId);
    expect(charlieInView).toBeDefined();
    expect(charlieInView!.hasFolded).toBe(true);
    expect(charlieInView!.cards.length).toBe(0);

    // Charlie must NOT be the toActPlayerId — the hand must continue normally
    expect(snapForAlice.toActPlayerId).not.toBe(charlie.playerId);

    // The hand must still be playable: current player acts (fold to end hand quickly)
    const toActId = snapForAlice.toActPlayerId!;
    const actingClient = toActId === alice.playerId ? alice : bob;
    await actingClient.pokerFold();

    // Hand must resolve to hand_summary without stalling
    await Promise.all([
      alice.waitForSnapshot((s: any) => s.phase === "hand_summary"),
      bob.waitForSnapshot((s: any) => s.phase === "hand_summary"),
    ]);

    alice.disconnect();
    bob.disconnect();
    charlie.disconnect();
  });

  it("allows seat switching between hands and when waiting, and host unseating between rounds or queued mid-hand", async () => {
    const alice = new TestClient("Alice");
    const bob = new TestClient("Bob");
    const charlie = new TestClient("Charlie");

    await alice.connect(serverUrl);
    await bob.connect(serverUrl);
    await charlie.connect(serverUrl);

    const { roomCode } = await alice.createRoom({
      displayName: "Alice",
      avatarId: "av-alice",
      gameType: "poker",
      config: { autoNextHandDelaySec: 10 },
    });

    await bob.joinRoom({ code: roomCode, displayName: "Bob", avatarId: "av-bob" });
    await charlie.joinRoom({ code: roomCode, displayName: "Charlie", avatarId: "av-charlie" });

    await alice.sit(1);
    await bob.sit(2);
    await alice.waitForSnapshot((s: any) => (s.players ?? []).length === 2);
    await alice.startSession();
    await alice.waitForSnapshot((s: any) => s.phase === "betting" && s.handNumber === 1);

    // Charlie joins mid-hand (waiting mode) at seat 3, then switches to seat 5 while waiting
    await charlie.sit(3);
    await charlie.waitForSnapshot((s: any) =>
      s.participants.some((p: any) => p.id === charlie.playerId && p.seat === 3),
    );
    await charlie.sit(5);
    const snapMoved = await charlie.waitForSnapshot((s: any) =>
      s.participants.some((p: any) => p.id === charlie.playerId && p.seat === 5),
    );
    expect(snapMoved.players.find((p: any) => p.id === charlie.playerId)?.seatNumber).toBe(5);

    // Active player cannot switch seats mid-hand
    await expect(alice.sit(4)).rejects.toThrow(/active hand/i);

    // Host queues unseat of Bob mid-hand
    await alice.assignSeat(bob.playerId, null);
    const queuedSnap = await alice.waitForSnapshot((s: any) =>
      (s.pendingUnseatPlayers ?? []).includes(bob.playerId),
    );
    expect(queuedSnap.pendingUnseatPlayers).toContain(bob.playerId);

    // Finish hand 1 (fold) -> Bob should be automatically unseated upon entering hand_summary!
    const toActId = (alice.latestSnapshot as ClientPokerGameView).toActPlayerId!;
    await (toActId === alice.playerId ? alice : bob).pokerFold();

    const summarySnap = await alice.waitForSnapshot(
      (s: any) =>
        s.phase === "hand_summary" &&
        s.participants.find((p: any) => p.id === bob.playerId)?.seat === null,
    );
    expect(summarySnap.participants.find((p: any) => p.id === bob.playerId)?.seat).toBeNull();

    // Between rounds (hand_summary), Charlie can switch from seat 5 to seat 2, and Host can unseat Charlie immediately
    await charlie.sit(2);
    await charlie.waitForSnapshot((s: any) =>
      s.participants.some((p: any) => p.id === charlie.playerId && p.seat === 2),
    );
    await alice.assignSeat(charlie.playerId, null);
    const afterUnseatSnap = await alice.waitForSnapshot(
      (s: any) => s.participants.find((p: any) => p.id === charlie.playerId)?.seat === null,
    );
    expect(afterUnseatSnap.participants.find((p: any) => p.id === charlie.playerId)?.seat).toBeNull();

    alice.disconnect();
    bob.disconnect();
    charlie.disconnect();
  });

  it("reverses poker hand mid-hand AND in hand_summary with exact chip conservation, pause/resume, endSession & closeTable", async () => {
    const alice = new TestClient("Alice");
    const bob = new TestClient("Bob");

    await alice.connect(serverUrl);
    await bob.connect(serverUrl);

    const { roomCode } = await alice.createRoom({
      displayName: "Alice",
      avatarId: "av-alice",
      gameType: "poker",
      config: { actionTimerSec: 1, autoNextHandDelaySec: 5 },
    });
    await bob.joinRoom({ code: roomCode, displayName: "Bob", avatarId: "av-bob" });
    await alice.sit(1);
    await bob.sit(2);
    await alice.waitForSnapshot((s: any) => (s.players ?? []).length === 2);
    await alice.startSession();
    await alice.waitForSnapshot((s: any) => s.phase === "betting" && s.handNumber === 1);

    // 1. Pause and verify actionTimer doesn't fire while paused, then Resume and verify timer DOES fire
    await alice.pause();
    await bob.waitForSnapshot((s: any) => s.isPaused === true);
    await new Promise((r) => setTimeout(r, 1200));
    expect((alice.latestSnapshot as ClientPokerGameView).phase).toBe("betting");
    expect((alice.latestSnapshot as ClientPokerGameView).isPaused).toBe(true);

    await alice.resume();
    await bob.waitForSnapshot((s: any) => s.isPaused === false);
    // After resume, the remaining ~1s poker action timer MUST actually fire and advance turn/hand!
    const hand1DoneSnap = await alice.waitForSnapshot(
      (s: any) => s.phase === "hand_summary",
      3500,
    );
    const preHand2Alice = hand1DoneSnap.stacks[alice.playerId]!;
    const preHand2Bob = hand1DoneSnap.stacks[bob.playerId]!;
    expect(preHand2Alice + preHand2Bob).toBe(20000);

    // Start Hand 2, raise, then cancel mid-hand
    await alice.pokerNextHand();
    await alice.waitForSnapshot((s: any) => s.phase === "betting" && s.handNumber === 2);

    const activeSnap = alice.latestSnapshot as ClientPokerGameView;
    const prevHandNum = activeSnap.handNumber - 1;
    const firstClient = activeSnap.toActPlayerId === alice.playerId ? alice : bob;
    await firstClient.pokerRaise(200);
    await alice.waitForSnapshot((s: any) => s.currentBet === 200);

    // Host reverses mid-hand
    await alice.cancelRoundRefund();
    const cancelledSnap = await alice.waitForSnapshot(
      (s: any) => s.phase === "hand_summary" && s.winners === null,
    );
    // Exact chip conservation: both stacks back to pre-hand baseline (no double-refund!)
    expect(cancelledSnap.stacks[alice.playerId]).toBe(preHand2Alice);
    expect(cancelledSnap.stacks[bob.playerId]).toBe(preHand2Bob);
    expect(cancelledSnap.handNumber).toBe(prevHandNum);

    // Host can advance cleanly to next hand without getting stuck
    await alice.pokerNextHand();
    const nextHandSnap = await alice.waitForSnapshot(
      (s: any) => s.phase === "betting" && s.handNumber === prevHandNum + 1,
    );
    const foldActor = nextHandSnap.toActPlayerId === alice.playerId ? alice : bob;
    await foldActor.pokerFold();
    const finishedSnap = await alice.waitForSnapshot(
      (s: any) => s.phase === "hand_summary" && Boolean(s.winners && s.winners.length > 0),
    );
    expect(finishedSnap.stacks[alice.playerId]! + finishedSnap.stacks[bob.playerId]!).toBe(20000);

    // Host reverses COMPLETED hand in hand_summary ("between rounds") -> chips revert cleanly to pre-hand baseline!
    await alice.cancelRoundRefund();
    const reversedSummarySnap = await alice.waitForSnapshot(
      (s: any) => s.phase === "hand_summary" && s.winners === null,
    );
    expect(reversedSummarySnap.stacks[alice.playerId]).toBe(preHand2Alice);
    expect(reversedSummarySnap.stacks[bob.playerId]).toBe(preHand2Bob);
    expect(reversedSummarySnap.handNumber).toBe(prevHandNum);

    // Host ends session cleanly without crashing on PokerState
    await alice.endSession();
    const lobbySnap = await bob.waitForSnapshot(
      (s: any) => s.phase === "lobby" && s.isSessionStarted === false,
    );
    expect(lobbySnap.phase).toBe("lobby");

    // Start again and closeTable mid-hand without crashing
    await alice.startSession();
    await alice.waitForSnapshot((s: any) => s.phase === "betting");

    let closedReceived = false;
    bob.socket?.on("room:closed", () => {
      closedReceived = true;
    });
    await alice.closeTable();
    await new Promise((r) => setTimeout(r, 150));
    expect(closedReceived).toBe(true);

    alice.disconnect();
    bob.disconnect();
  });
});
