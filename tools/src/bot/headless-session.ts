import { type ClientGameView, evaluateHand, scanForLeaks } from "@felt/shared";
import { type Socket, io } from "socket.io-client";

interface BotState {
  name: string;
  socket: Socket;
  playerId: string;
  token: string;
  seat: number | null;
  latestSnapshot: ClientGameView | null;
}

interface SocketAck<T = unknown> {
  ok: boolean;
  data?: T;
  error?: { message?: string };
}

const SERVER_URL = process.argv[2] || "http://localhost:3001";
const ROUNDS_TO_PLAY = Number(process.argv[3] || 3);

console.log(
  `\n♠️  Starting Felt Headless Test Clients against ${SERVER_URL} (playing ${ROUNDS_TO_PLAY} rounds)\n`,
);

async function createBot(name: string): Promise<BotState> {
  const socket = io(SERVER_URL, {
    transports: ["websocket"],
    autoConnect: true,
  });

  await new Promise<void>((resolve, reject) => {
    socket.on("connect", () => resolve());
    socket.on("connect_error", (e: Error) => reject(e));
  });

  const bot: BotState = {
    name,
    socket,
    playerId: "",
    token: "",
    seat: null,
    latestSnapshot: null,
  };

  socket.on("snapshot", (payload: { data: ClientGameView }) => {
    bot.latestSnapshot = payload.data;
  });

  return bot;
}

async function waitFor(
  bot: BotState,
  predicate: (s: ClientGameView) => boolean,
  timeoutMs = 8000,
): Promise<ClientGameView> {
  if (bot.latestSnapshot && predicate(bot.latestSnapshot)) {
    return bot.latestSnapshot;
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `[${bot.name}] Timeout waiting for condition. Current phase: ${bot.latestSnapshot?.phase}`,
        ),
      );
    }, timeoutMs);

    const onSnap = (payload: { data: ClientGameView }) => {
      if (predicate(payload.data)) {
        cleanup();
        resolve(payload.data);
      }
    };

    const cleanup = () => {
      clearTimeout(timer);
      bot.socket.off("snapshot", onSnap);
    };

    bot.socket.on("snapshot", onSnap);
  });
}

async function run() {
  // 1. Create bots
  const host = await createBot("HostAlice");
  const dealer = await createBot("DanDealer");
  const p1 = await createBot("Priya");
  const p2 = await createBot("Raj");
  const p3 = await createBot("Meera");
  const spectator = await createBot("SamSpectator");

  const allBots = [host, dealer, p1, p2, p3, spectator];

  // 2. Host creates room
  const createRes = await new Promise<{
    roomCode: string;
    token: string;
    participant: { id: string };
  }>((res, rej) => {
    host.socket.emit(
      "room:create",
      { displayName: host.name, avatarId: "av-host" },
      (r: SocketAck<{ roomCode: string; token: string; participant: { id: string } }>) => {
        if (r?.ok && r.data) res(r.data);
        else rej(new Error(r?.error?.message ?? "Failed to create room"));
      },
    );
  });

  const roomCode = createRes.roomCode;
  host.playerId = createRes.participant.id;
  host.token = createRes.token;
  console.log(`✓ Room created with code: ${roomCode}`);

  // 3. Others join room
  for (const bot of [dealer, p1, p2, p3, spectator]) {
    const joinRes = await new Promise<{ token: string; participant: { id: string } }>(
      (res, rej) => {
        bot.socket.emit(
          "room:join",
          { code: roomCode, displayName: bot.name, avatarId: `av-${bot.name}` },
          (r: SocketAck<{ token: string; participant: { id: string } }>) => {
            if (r?.ok && r.data) res(r.data);
            else rej(new Error(r?.error?.message ?? "Failed to join room"));
          },
        );
      },
    );
    bot.playerId = joinRes.participant.id;
    bot.token = joinRes.token;
  }
  console.log(`✓ All 5 bots joined room ${roomCode}`);

  // 4. Assign dealer
  await new Promise<void>((res) =>
    host.socket.emit("host:setDealer", { targetId: dealer.playerId }, () => res()),
  );
  await host.socket.emit("seat:sit", { seat: 1 }); // Host sits at seat 1
  p1.seat = 2;
  p2.seat = 3;
  p3.seat = 4;
  await new Promise<void>((res) => p1.socket.emit("seat:sit", { seat: 2 }, () => res()));
  await new Promise<void>((res) => p2.socket.emit("seat:sit", { seat: 3 }, () => res()));
  await new Promise<void>((res) => p3.socket.emit("seat:sit", { seat: 4 }, () => res()));

  await waitFor(host, (s) => s.participants.filter((p) => p.seat !== null).length >= 4);
  console.log("✓ Dealer assigned and 4 players seated");

  // 5. Host starts session
  await new Promise<void>((res) => host.socket.emit("host:startSession", {}, () => res()));
  await waitFor(p1, (s) => s.phase === "betting");
  console.log("✓ Session started — entered BETTING phase");

  // 6. Play rounds
  for (let round = 1; round <= ROUNDS_TO_PLAY; round++) {
    console.log(`\n─── Round ${round} ─────────────────────────────────`);

    // Betting
    for (const player of [host, p1, p2, p3]) {
      const betAmount = 100 * (player === host ? 1 : player === p1 ? 2 : 1);
      await new Promise<void>((res) =>
        player.socket.emit("bet:add", { amount: betAmount }, () => res()),
      );
      await new Promise<void>((res) => player.socket.emit("bet:lock", {}, () => res()));
    }

    await new Promise((r) => setTimeout(r, 50));
    console.log("✓ All players locked bets");

    // Dealer deals
    await new Promise<void>((res) => dealer.socket.emit("dealer:deal", {}, () => res()));
    await waitFor(p1, (s) => s.phase !== "betting" && s.phase !== "dealing");

    // Hidden info check
    for (const bot of allBots) {
      if (bot.latestSnapshot) {
        const leaks = scanForLeaks(bot.latestSnapshot);
        if (leaks.length > 0) {
          console.error(`🚨 LEAK DETECTED in bot ${bot.name}:`, leaks);
          process.exit(1);
        }
      }
    }
    console.log("✓ Hole card verified hidden for all clients");

    // Player turns
    while (true) {
      const current = p1.latestSnapshot;
      if (!current || current.phase !== "player_turns") break;
      const hand = current.hands.find((h) => h.id === current.activeHandId);
      if (!hand) break;

      const activeBot = allBots.find((b) => b.playerId === hand.playerId);
      if (!activeBot) break;

      const cards = hand.cards.flatMap((c) => ("card" in c ? [c.card] : []));
      const evalHand = evaluateHand(cards);
      // Basic strategy: hit hard total < 17
      if (evalHand.total < 17 && !evalHand.isBust) {
        await new Promise<void>((res) =>
          activeBot.socket.emit("play:hit", { handId: hand.id }, () => res()),
        );
      } else {
        await new Promise<void>((res) =>
          activeBot.socket.emit("play:stand", { handId: hand.id }, () => res()),
        );
      }

      await new Promise((r) => setTimeout(r, 40));
    }

    // Wait for round summary
    const summary = await waitFor(p1, (s) => s.phase === "round_summary");
    console.log(`✓ Round ${round} completed: Dealer bank: ${summary.dealerBank.toLocaleString()}`);

    for (const p of summary.participants.filter((x) => x.seat !== null)) {
      const stack = summary.stacks[p.id] ?? 0;
      console.log(`   - ${p.displayName} (Seat ${p.seat}): ${stack.toLocaleString()} chips`);
    }

    if (round < ROUNDS_TO_PLAY) {
      await new Promise<void>((res) => dealer.socket.emit("dealer:nextRound", {}, () => res()));
      await waitFor(p1, (s) => s.phase === "betting");
    }
  }

  // Cleanup
  for (const bot of allBots) {
    bot.socket.disconnect();
  }

  console.log("\n🎉 Headless session completed successfully with 0 hidden-information leaks!\n");
  process.exit(0);
}

run().catch((err) => {
  console.error("Error running headless session:", err);
  process.exit(1);
});
