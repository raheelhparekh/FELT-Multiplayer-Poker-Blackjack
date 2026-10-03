import "dotenv/config";
import { dbService } from "./db/index.js";
import { createServer } from "./server.js";

const PORT = Number(process.env["PORT"] ?? 3001);
const HOST = process.env["HOST"] ?? "0.0.0.0";

const server = createServer({
  port: PORT,
  host: HOST,
  logger: true,
  pacingEnabled: process.env["PACING_ENABLED"] !== "false",
});

async function main() {
  try {
    // 1. Initialize database tables if connected to Postgres
    await dbService.initDatabase();

    // 2. Start HTTP + WebSocket server
    const addr = await server.start();
    server.fastify.log.info(`Server listening on ${addr}`);

    // 3. Restore any live room snapshots (e.g. from previous deployment)
    const restoredCount = await server.roomManager.restoreSnapshots();
    if (restoredCount > 0) {
      server.fastify.log.info(`Restored ${restoredCount} active room snapshot(s) from database`);
    }

    // 4. Daily prune job (every 24 hours: remove sessions older than 180 days)
    setInterval(
      () => {
        dbService
          .pruneOldSessions(180)
          .then((n) => {
            if (n > 0)
              server.fastify.log.info(`Pruned ${n} expired session(s) older than 180 days`);
          })
          .catch((err) => server.fastify.log.error(err, "Failed to run session prune job"));
      },
      24 * 60 * 60 * 1000,
    );
  } catch (err) {
    server.fastify.log.error(err);
    process.exit(1);
  }
}

// Graceful shutdown handling: save live room snapshots on SIGTERM/SIGINT
async function handleShutdown(signal: string) {
  server.fastify.log.info(`Received ${signal}. Saving active room snapshots...`);
  try {
    await server.roomManager.saveAllSnapshots();
    server.fastify.log.info("Active room snapshots saved.");
  } catch (err) {
    server.fastify.log.error(err, "Error saving room snapshots on shutdown");
  }
  await server.close();
  process.exit(0);
}

process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));

main();
