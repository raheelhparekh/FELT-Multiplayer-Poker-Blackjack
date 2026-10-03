import { existsSync } from "node:fs";
import path from "node:path";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { Server as SocketIOServer } from "socket.io";
import { RoomManager } from "./rooms/room-manager.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { setupSocketIO } from "./ws/handler.js";

export interface ServerOptions {
  port?: number;
  host?: string;
  logger?: boolean;
  pacingEnabled?: boolean;
}

export interface AppInstance {
  fastify: FastifyInstance;
  io: SocketIOServer;
  roomManager: RoomManager;
  start: () => Promise<string>;
  close: () => Promise<void>;
}

export function createServer(options: ServerOptions = {}): AppInstance {
  const port = options.port ?? Number(process.env["PORT"] ?? 3001);
  const host = options.host ?? process.env["HOST"] ?? "0.0.0.0";
  const pacingEnabled = options.pacingEnabled ?? true;

  const fastify = Fastify({
    logger: options.logger ?? false,
  });

  fastify.register(cors, {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  });

  fastify.register(helmet, {
    contentSecurityPolicy: false,
  });

  fastify.register(cookie, {
    secret: process.env["JWT_SECRET"] || "felt-cookie-secret",
  });

  registerAuthRoutes(fastify);

  const io = new SocketIOServer(fastify.server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
  });

  const roomManager = new RoomManager();
  setupSocketIO(io, roomManager, { pacingEnabled });

  // Health check
  fastify.get("/healthz", async () => ({
    status: "ok",
    ts: Date.now(),
    rooms: roomManager.getActiveRoomCount(),
  }));

  // API room info
  fastify.get("/api/rooms/:code", async (request, reply) => {
    const { code } = request.params as { code: string };
    const room = roomManager.getRoom(code);
    if (!room) {
      return reply.code(404).send({ exists: false, error: "Room not found" });
    }

    return {
      exists: true,
      roomCode: room.roomCode,
      phase: room.state.phase,
      isSessionStarted: room.state.isSessionStarted,
      participantsCount: room.participants.size,
      hasPassword: Boolean(room.password),
    };
  });

  // Serve production web build if present
  const staticCandidates = [
    process.env["STATIC_DIR"],
    path.resolve(process.cwd(), "apps/web/dist"),
    path.resolve(process.cwd(), "../web/dist"),
    path.resolve(process.cwd(), "dist/web"),
  ].filter((p): p is string => Boolean(p && existsSync(p)));

  const staticDir = staticCandidates[0];
  if (staticDir) {
    fastify.register(fastifyStatic, {
      root: staticDir,
      prefix: "/",
      wildcard: false,
    });

    fastify.setNotFoundHandler((request, reply) => {
      const url = request.raw.url || "";
      if (url.startsWith("/api") || url.startsWith("/socket.io") || url.startsWith("/healthz")) {
        return reply.code(404).send({ error: "Not Found" });
      }
      return reply.sendFile("index.html");
    });
  }

  const start = async (): Promise<string> => {
    return await fastify.listen({ port, host });
  };

  const close = async (): Promise<void> => {
    roomManager.destroy();
    io.close();
    await fastify.close();
  };

  return {
    fastify,
    io,
    roomManager,
    start,
    close,
  };
}
