import { type ClientGameView, evaluateHand, scanForLeaks } from "@felt/shared";
import { type Socket, io } from "socket.io-client";

interface BotState {
  name: string;
  socket: Socket;
  playerId: string;
  token: string;
  seat: number | null;
  latestSnapshot: ClientGameView | null;
  chatCount: number;
}

interface SocketAck<T = unknown> {
  ok: boolean;
  data?: T;
  error?: { message?: string };
}

const SERVER_URL = process.argv[2] || "http://localhost:3001";
const ROUNDS_TO_PLAY = Number(process.argv[3] || 2);
const TOTAL_CLIENTS = 12;

console.log(
  `\n🚀 [Load Test] Launching ${TOTAL_CLIENTS} concurrent headless connections against ${SERVER_URL} (${ROUNDS_TO_PLAY} rounds)\n`,
);

async function createBot(name: string): Promise<BotState> {
  const socket = io(SERVER_URL, {
    transports: ["websocket"],
    autoConnect: true,
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Connect timeout for ${name}`)), 5000);
    socket.on("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.on("connect_error", (e: Error) => {
      clearTimeout(timer);
      reject(e);
    });
  });

  const bot: BotState = {
    name,
    socket,
    playerId: "",
    token: "",
    seat: null,
    latestSnapshot: null,
    chatCount: 0,
  };

  socket.on("snapshot", (payload: { data: ClientGameView }) => {
    bot.latestSnapshot = payload.data;
  });

  socket.on("chat:message", () => {
    bot.chatCount++;
  });

  return bot;
}

async function waitFor(
  bot: BotState,
  predicate: (s: ClientGameView) => boolean,
  timeoutMs = 10000,
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

async function runLoadTest() {
  const startTime = Date.now();

  // 1. Establish 12 concurrent connections
  console.log(`⏳ Connecting ${TOTAL_CLIENTS} headless clients in parallel...`);
  const botNames = [
    "HostAlice",
    "DanDealer",
    "PlayerBob",
    "PlayerCharlie",
    "PlayerDiana",
    "PlayerEvan",
    "PlayerFiona",
    "PlayerGeorge",
    "SpecHannah",
    "SpecIan",
    "SpecJack",
    "SpecKiran",
  ];

  const bots = await Promise.all(botNames.map((name) => createBot(name)));
  console.log(`✓ All ${bots.length} clients connected successfully!`);

  const host = bots[0]!;
  const dealer = bots[1]!;
  const seatedPlayers = bots.slice(2, 8); // 6 seated players (seats 1-6)
  const spectators = bots.slice(8); // 4 spectators

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
  console.log(`✓ Room created: ${roomCode}`);

  // 3. Other 11 clients join room in parallel
  console.log("⏳ Joining room with remaining 11 clients concurrently...");
  await Promise.all(
    bots.slice(1).map(async (bot) => {
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
    }),
  );
  console.log(`✓ All 12 clients joined room ${roomCode}`);

  // 4. Assign dealer and seat players
  await new Promise<void>((res) =>
    host.socket.emit("host:setDealer", { targetId: dealer.playerId }, () => res()),
  );
  await new Promise<void>((res) => host.socket.emit("seat:sit", { seat: 1 }, () => res()));
  host.seat = 1;

  for (let i = 0; i < seatedPlayers.length; i++) {
    const p = seatedPlayers[i]!;
    const seatIdx = i + 2;
    p.seat = seatIdx;
    await new Promise<void>((res) => p.socket.emit("seat:sit", { seat: seatIdx }, () => res()));
  }

  await waitFor(host, (s) => s.participants.filter((p) => p.seat !== null).length === 7);
  console.log(
    "✓ Full 7-player table seated (1 host + 6 players) + 1 dedicated dealer + 4 spectators",
  );

  // 5. Spectators send chat messages concurrently
  for (const spec of spectators) {
    spec.socket.emit("chat:send", { text: `Hello from ${spec.name}!` });
  }

  // 6. Host starts session
  await new Promise<void>((res) => host.socket.emit("host:startSession", {}, () => res()));
  await waitFor(host, (s) => s.phase === "betting");
  console.log("✓ Session started — entered BETTING phase");

  const activeBettors = [host, ...seatedPlayers];

  // 7. Play rounds
  for (let round = 1; round <= ROUNDS_TO_PLAY; round++) {
    console.log(`\n─── Round ${round} / ${ROUNDS_TO_PLAY} ─────────────────────────────────`);

    // Betting: All 7 seated players bet and lock
    await Promise.all(
      activeBettors.map(async (player, idx) => {
        const betAmount = 100 * ((idx % 3) + 1);
        await new Promise<void>((res) =>
          player.socket.emit("bet:add", { amount: betAmount }, () => res()),
        );
        await new Promise<void>((res) => player.socket.emit("bet:lock", {}, () => res()));
      }),
    );
    console.log("✓ All 7 seated players placed and locked bets");

    // Dealer deals
    await new Promise<void>((res) => dealer.socket.emit("dealer:deal", {}, () => res()));
    await waitFor(host, (s) => s.phase !== "betting" && s.phase !== "dealing", 25000);

    // Handle insurance if triggered
    if (host.latestSnapshot?.phase === "insurance") {
      await Promise.all(
        activeBettors.map(
          (p) =>
            new Promise<void>((res) =>
              p.socket.emit("insurance:decision", { accept: false }, () => res()),
            ),
        ),
      );
      await waitFor(host, (s) => s.phase !== "insurance", 10000);
    }

    // Hidden info leak scan across all 12 clients
    for (const bot of bots) {
      if (bot.latestSnapshot) {
        const leaks = scanForLeaks(bot.latestSnapshot);
        if (leaks.length > 0) {
          console.error(`🚨 DATA LEAK in bot ${bot.name}:`, leaks);
          throw new Error("Hidden card leaked to client!");
        }
      }
    }
    console.log("✓ Zero hidden info leaks verified across all 12 connections");

    // Player turns
    while (true) {
      const snap = host.latestSnapshot;
      if (!snap || snap.phase !== "player_turns") break;
      const hand = snap.hands.find((h) => h.id === snap.activeHandId);
      if (!hand) break;

      const activeBot = bots.find((b) => b.playerId === hand.playerId);
      if (!activeBot) break;

      const cards = hand.cards.flatMap((c) => ("card" in c ? [c.card] : []));
      const total = evaluateHand(cards).total;

      if (total < 17) {
        await new Promise<void>((res) =>
          activeBot.socket.emit("play:hit", { handId: hand.id }, () => res()),
        );
        await new Promise((r) => setTimeout(r, 60));
      } else {
        await new Promise<void>((res) =>
          activeBot.socket.emit("play:stand", { handId: hand.id }, () => res()),
        );
        await new Promise((r) => setTimeout(r, 60));
      }
    }
    console.log("✓ Player turns completed");

    // Wait for settlement & round summary
    await waitFor(host, (s) => s.phase === "round_summary", 25000);
    console.log("✓ Dealer played and round settled into round_summary");

    if (round < ROUNDS_TO_PLAY) {
      await new Promise<void>((res) => dealer.socket.emit("dealer:nextRound", {}, () => res()));
      await waitFor(host, (s) => s.phase === "betting", 15000);
    }
  }

  // End session
  await new Promise<void>((res) => host.socket.emit("host:endSession", {}, () => res()));
  await waitFor(host, (s) => s.phase === "lobby");
  console.log("✓ Session ended cleanly by host");

  // Disconnect all bots
  for (const bot of bots) {
    bot.socket.disconnect();
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n🎉 [Load Test Passed] Successfully ran 12 headless clients for ${durationSec}s!`);
}

runLoadTest().catch((err) => {
  console.error("❌ Load test failed:", err);
  process.exit(1);
});
