import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { createToken, hashPassword, verifyPassword, verifyToken } from "../auth/crypto.js";
import { dbService } from "../db/index.js";

const RegisterSchema = z.object({
  email: z.string().email().max(255),
  username: z
    .string()
    .min(2)
    .max(30)
    .regex(/^[a-zA-Z0-9_-]+$/, "Alphanumeric, underscore, dash only"),
  password: z.string().min(6).max(100),
  avatarId: z.string().optional(),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export function getAuthUser(req: FastifyRequest) {
  // Check cookie or Authorization header
  const cookieToken = req.cookies?.["felt_auth"];
  const headerToken = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  const token = cookieToken || headerToken;

  if (!token) return null;
  return verifyToken(token);
}

export async function registerAuthRoutes(fastify: FastifyInstance) {
  // POST /api/auth/register
  fastify.post("/api/auth/register", async (req: FastifyRequest, reply: FastifyReply) => {
    const parseRes = RegisterSchema.safeParse(req.body);
    if (!parseRes.success) {
      return reply.status(400).send({
        ok: false,
        error: parseRes.error.errors[0]?.message || "Invalid registration data",
      });
    }

    const { email, username, password, avatarId } = parseRes.data;

    // Check if email or username already taken
    const existingEmail = await dbService.findUserByEmail(email);
    if (existingEmail) {
      return reply.status(409).send({ ok: false, error: "Email already registered" });
    }

    const existingUsername = await dbService.findUserByUsername(username);
    if (existingUsername) {
      return reply.status(409).send({ ok: false, error: "Username already taken" });
    }

    const passwordHash = hashPassword(password);
    const user = await dbService.createUser({
      email,
      username,
      passwordHash,
      avatarId: avatarId || "lion",
    });

    const token = createToken(user);

    reply.setCookie("felt_auth", token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 30 * 86400, // 30 days
    });

    return reply.status(201).send({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        avatarId: user.avatarId,
      },
      token,
    });
  });

  // POST /api/auth/login
  fastify.post("/api/auth/login", async (req: FastifyRequest, reply: FastifyReply) => {
    const parseRes = LoginSchema.safeParse(req.body);
    if (!parseRes.success) {
      return reply.status(400).send({ ok: false, error: "Invalid login data" });
    }

    const { email, password } = parseRes.data;
    const user = await dbService.findUserByEmail(email);

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return reply.status(401).send({ ok: false, error: "Invalid email or password" });
    }

    const token = createToken(user);

    reply.setCookie("felt_auth", token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 30 * 86400,
    });

    return reply.send({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        avatarId: user.avatarId,
      },
      token,
    });
  });

  // POST /api/auth/logout
  fastify.post("/api/auth/logout", async (_req: FastifyRequest, reply: FastifyReply) => {
    reply.clearCookie("felt_auth", { path: "/" });
    return reply.send({ ok: true });
  });

  // GET /api/auth/me
  fastify.get("/api/auth/me", async (req: FastifyRequest, reply: FastifyReply) => {
    const tokenPayload = getAuthUser(req);
    if (!tokenPayload) {
      return reply.send({ ok: false, user: null });
    }

    const user = await dbService.findUserById(tokenPayload.userId);
    if (!user) {
      return reply.send({ ok: false, user: null });
    }

    return reply.send({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        avatarId: user.avatarId,
      },
    });
  });

  // GET /api/sessions/my
  fastify.get("/api/sessions/my", async (req: FastifyRequest, reply: FastifyReply) => {
    const tokenPayload = getAuthUser(req);
    if (!tokenPayload) {
      return reply.status(401).send({ ok: false, error: "Unauthorized" });
    }

    const sessions = await dbService.getUserSessionSummaries(tokenPayload.userId);

    const stats = sessions.reduce(
      (acc, s) => {
        acc.totalRounds += s.result.roundsPlayed;
        acc.totalNet += s.result.net;
        if (s.result.net > 0) acc.winningSessions++;
        return acc;
      },
      { totalSessions: sessions.length, totalRounds: 0, totalNet: 0, winningSessions: 0 },
    );

    return reply.send({
      ok: true,
      stats,
      sessions: sessions.map((s) => ({
        sessionId: s.summary.id,
        roomCode: s.summary.roomCode,
        startedAt: s.summary.startedAt,
        endedAt: s.summary.endedAt,
        rounds: s.summary.rounds,
        displayName: s.result.displayName,
        totalBuyIn: s.result.totalBuyIn,
        finalStack: s.result.finalStack,
        net: s.result.net,
        roundsPlayed: s.result.roundsPlayed,
      })),
    });
  });
}
