import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createToken, hashPassword, verifyPassword, verifyToken } from "../auth/crypto.js";
import { dbService } from "../db/index.js";
import { type AppInstance, createServer } from "../server.js";

describe("Phase 5 — Auth, Crypto & Session Summaries", () => {
  let app: AppInstance;
  let _serverUrl: string;

  beforeAll(async () => {
    app = createServer({ port: 0, logger: false, pacingEnabled: false });
    _serverUrl = await app.start();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("Password Hashing & JWT Verification", () => {
    it("hashes passwords securely and verifies correctly", () => {
      const password = "SuperSecretPassword123!";
      const hash = hashPassword(password);

      expect(hash).toMatch(/^scrypt\$/);
      expect(verifyPassword(password, hash)).toBe(true);
      expect(verifyPassword("WrongPassword", hash)).toBe(false);
    });

    it("generates and verifies tamper-evident JWTs", () => {
      const user = {
        id: "usr-test-1",
        email: "player@example.com",
        username: "AceKing",
        avatarId: "lion",
      };

      const token = createToken(user, 1);
      const decoded = verifyToken(token);

      expect(decoded).not.toBeNull();
      expect(decoded?.userId).toBe(user.id);
      expect(decoded?.email).toBe(user.email);
      expect(decoded?.username).toBe(user.username);

      // Tampered token fails
      const tampered = `${token.slice(0, -4)}abcd`;
      expect(verifyToken(tampered)).toBeNull();
    });
  });

  describe("Fastify Auth REST Endpoints", () => {
    const testEmail = `player_${Date.now()}@test.felt`;
    const testUsername = `user_${Date.now()}`;
    let authToken = "";

    it("registers a new user and sets cookie & returns token", async () => {
      const res = await app.fastify.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: testEmail,
          username: testUsername,
          password: "password123",
          avatarId: "fox",
        },
      });

      expect(res.statusCode).toBe(201);
      const data = res.json();
      expect(data.ok).toBe(true);
      expect(data.user.email).toBe(testEmail);
      expect(data.user.username).toBe(testUsername);
      expect(data.token).toBeDefined();
      authToken = data.token;
    });

    it("rejects duplicate email registration", async () => {
      const res = await app.fastify.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: testEmail,
          username: `diff_${Date.now()}`,
          password: "password123",
        },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toContain("Email already registered");
    });

    it("logs in with valid credentials", async () => {
      const res = await app.fastify.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: testEmail,
          password: "password123",
        },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.ok).toBe(true);
      expect(data.user.username).toBe(testUsername);
    });

    it("fetches current user via /api/auth/me", async () => {
      const res = await app.fastify.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.ok).toBe(true);
      expect(data.user.email).toBe(testEmail);
    });
  });

  describe("Session Summaries & Pruning", () => {
    it("creates a session summary and player result rows", async () => {
      const user = await dbService.createUser({
        email: `summary_${Date.now()}@test.felt`,
        username: `summary_usr_${Date.now()}`,
        passwordHash: "dummy",
        avatarId: "bear",
      });

      const summary = await dbService.createSessionSummary({
        roomCode: "XYZ999",
        startedAt: new Date(Date.now() - 3600000),
        endedAt: new Date(),
        rounds: 15,
        hostUserId: user.id,
      });

      expect(summary.id).toBeDefined();
      expect(summary.roomCode).toBe("XYZ999");

      const results = await dbService.createSessionPlayerResults([
        {
          sessionId: summary.id,
          userId: user.id,
          displayName: user.username,
          totalBuyIn: 5000,
          finalStack: 7500,
          net: 2500,
          roundsPlayed: 15,
        },
      ]);

      expect(results).toHaveLength(1);
      expect(results[0]?.net).toBe(2500);

      // Verify retrieval
      const userSessions = await dbService.getUserSessionSummaries(user.id);
      expect(userSessions).toHaveLength(1);
      expect(userSessions[0]?.summary.roomCode).toBe("XYZ999");
      expect(userSessions[0]?.result.net).toBe(2500);
    });

    it("prunes sessions older than specified days", async () => {
      // Create an old session (> 180 days ago)
      const oldDate = new Date(Date.now() - 200 * 86400000);
      const oldSummary = await dbService.createSessionSummary({
        roomCode: "OLD123",
        startedAt: oldDate,
        endedAt: oldDate,
        rounds: 5,
      });

      await dbService.createSessionPlayerResults([
        {
          sessionId: oldSummary.id,
          displayName: "OldPlayer",
          totalBuyIn: 5000,
          finalStack: 4000,
          net: -1000,
          roundsPlayed: 5,
        },
      ]);

      const prunedCount = await dbService.pruneOldSessions(180);
      expect(prunedCount).toBeGreaterThanOrEqual(1);
    });
  });
});
