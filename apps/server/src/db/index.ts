import { desc, eq, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";
import type {
  NewSessionPlayerResult,
  NewSessionSummary,
  NewUser,
  SessionPlayerResult,
  SessionSummary,
  User,
} from "./schema.js";

const { Pool } = pg;

export interface DatabaseService {
  isConfigured: boolean;
  createUser: (user: NewUser) => Promise<User>;
  findUserByEmail: (email: string) => Promise<User | null>;
  findUserByUsername: (username: string) => Promise<User | null>;
  findUserById: (id: string) => Promise<User | null>;
  createSessionSummary: (summary: NewSessionSummary) => Promise<SessionSummary>;
  createSessionPlayerResults: (results: NewSessionPlayerResult[]) => Promise<SessionPlayerResult[]>;
  getUserSessionSummaries: (userId: string) => Promise<
    Array<{
      summary: SessionSummary;
      result: SessionPlayerResult;
    }>
  >;
  pruneOldSessions: (olderThanDays?: number) => Promise<number>;
  saveRoomSnapshot: (roomCode: string, json: string) => Promise<void>;
  getRoomSnapshots: () => Promise<schema.RoomSnapshot[]>;
  deleteRoomSnapshot: (roomCode: string) => Promise<void>;
  initDatabase: () => Promise<void>;
}

// ── In-Memory Fallback Implementation for Local Dev / Test Environments ─────────

class InMemoryDatabaseService implements DatabaseService {
  public isConfigured = false;
  private users: Map<string, User> = new Map();
  private summaries: Map<string, SessionSummary> = new Map();
  private results: SessionPlayerResult[] = [];
  private roomSnapshots: Map<string, schema.RoomSnapshot> = new Map();

  async createUser(data: NewUser): Promise<User> {
    const id = data.id || `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const user: User = {
      id,
      email: data.email.toLowerCase(),
      username: data.username,
      passwordHash: data.passwordHash,
      avatarId: data.avatarId || "lion",
      createdAt: new Date(),
    };
    this.users.set(id, user);
    return user;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const clean = email.toLowerCase();
    for (const u of this.users.values()) {
      if (u.email === clean) return u;
    }
    return null;
  }

  async findUserByUsername(username: string): Promise<User | null> {
    const clean = username.toLowerCase();
    for (const u of this.users.values()) {
      if (u.username.toLowerCase() === clean) return u;
    }
    return null;
  }

  async findUserById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async createSessionSummary(data: NewSessionSummary): Promise<SessionSummary> {
    const id = data.id || `sess-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const summary: SessionSummary = {
      id,
      roomCode: data.roomCode,
      gameType: data.gameType || "blackjack",
      startedAt: data.startedAt,
      endedAt: data.endedAt || new Date(),
      rounds: data.rounds,
      handsPlayed: data.handsPlayed || null,
      hostUserId: data.hostUserId || null,
    };
    this.summaries.set(id, summary);
    return summary;
  }

  async createSessionPlayerResults(
    dataList: NewSessionPlayerResult[],
  ): Promise<SessionPlayerResult[]> {
    const created: SessionPlayerResult[] = [];
    for (const data of dataList) {
      const res: SessionPlayerResult = {
        id: data.id || `res-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        sessionId: data.sessionId,
        userId: data.userId || null,
        displayName: data.displayName,
        totalBuyIn: data.totalBuyIn,
        finalStack: data.finalStack,
        net: data.net,
        roundsPlayed: data.roundsPlayed,
      };
      this.results.push(res);
      created.push(res);
    }
    return created;
  }

  async getUserSessionSummaries(userId: string): Promise<
    Array<{
      summary: SessionSummary;
      result: SessionPlayerResult;
    }>
  > {
    const userResults = this.results.filter((r) => r.userId === userId);
    const combined: Array<{ summary: SessionSummary; result: SessionPlayerResult }> = [];

    for (const res of userResults) {
      const summ = this.summaries.get(res.sessionId);
      if (summ) {
        combined.push({ summary: summ, result: res });
      }
    }
    // Return sorted newest first
    return combined.sort((a, b) => b.summary.endedAt.getTime() - a.summary.endedAt.getTime());
  }

  async pruneOldSessions(olderThanDays = 180): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 86400000);
    let pruned = 0;
    for (const [id, s] of this.summaries.entries()) {
      if (s.endedAt < cutoff) {
        this.summaries.delete(id);
        this.results = this.results.filter((r) => r.sessionId !== id);
        pruned++;
      }
    }
    return pruned;
  }

  async saveRoomSnapshot(roomCode: string, json: string): Promise<void> {
    this.roomSnapshots.set(roomCode, {
      roomCode,
      snapshotJson: json,
      updatedAt: new Date(),
    });
  }

  async getRoomSnapshots(): Promise<schema.RoomSnapshot[]> {
    return Array.from(this.roomSnapshots.values());
  }

  async deleteRoomSnapshot(roomCode: string): Promise<void> {
    this.roomSnapshots.delete(roomCode);
  }

  async initDatabase(): Promise<void> {
    // In-memory mode requires no DDL initialization
  }
}

// ── PostgreSQL Drizzle Implementation ──────────────────────────────────────────

class PostgresDatabaseService implements DatabaseService {
  public isConfigured = true;
  private db: ReturnType<typeof drizzle>;
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
    this.db = drizzle(this.pool, { schema });
  }

  async createUser(data: NewUser): Promise<User> {
    const [inserted] = await this.db
      .insert(schema.users)
      .values({ ...data, email: data.email.toLowerCase() })
      .returning();
    if (!inserted) throw new Error("Failed to insert user");
    return inserted;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const [found] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase()))
      .limit(1);
    return found || null;
  }

  async findUserByUsername(username: string): Promise<User | null> {
    const [found] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, username))
      .limit(1);
    return found || null;
  }

  async findUserById(id: string): Promise<User | null> {
    const [found] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1);
    return found || null;
  }

  async createSessionSummary(data: NewSessionSummary): Promise<SessionSummary> {
    const [inserted] = await this.db.insert(schema.sessionSummaries).values(data).returning();
    if (!inserted) throw new Error("Failed to insert session summary");
    return inserted;
  }

  async createSessionPlayerResults(
    dataList: NewSessionPlayerResult[],
  ): Promise<SessionPlayerResult[]> {
    if (dataList.length === 0) return [];
    return this.db.insert(schema.sessionPlayerResults).values(dataList).returning();
  }

  async getUserSessionSummaries(userId: string): Promise<
    Array<{
      summary: SessionSummary;
      result: SessionPlayerResult;
    }>
  > {
    const rows = await this.db
      .select({
        summary: schema.sessionSummaries,
        result: schema.sessionPlayerResults,
      })
      .from(schema.sessionPlayerResults)
      .innerJoin(
        schema.sessionSummaries,
        eq(schema.sessionPlayerResults.sessionId, schema.sessionSummaries.id),
      )
      .where(eq(schema.sessionPlayerResults.userId, userId))
      .orderBy(desc(schema.sessionSummaries.endedAt));

    return rows;
  }

  async pruneOldSessions(olderThanDays = 180): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 86400000);
    const deleted = await this.db
      .delete(schema.sessionSummaries)
      .where(lt(schema.sessionSummaries.endedAt, cutoff))
      .returning({ id: schema.sessionSummaries.id });
    return deleted.length;
  }

  async saveRoomSnapshot(roomCode: string, json: string): Promise<void> {
    await this.db
      .insert(schema.roomSnapshots)
      .values({
        roomCode,
        snapshotJson: json,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.roomSnapshots.roomCode,
        set: {
          snapshotJson: json,
          updatedAt: new Date(),
        },
      });
  }

  async getRoomSnapshots(): Promise<schema.RoomSnapshot[]> {
    return this.db.select().from(schema.roomSnapshots);
  }

  async deleteRoomSnapshot(roomCode: string): Promise<void> {
    await this.db.delete(schema.roomSnapshots).where(eq(schema.roomSnapshots.roomCode, roomCode));
  }

  async initDatabase(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL UNIQUE,
        username VARCHAR(50) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        avatar_id VARCHAR(50) NOT NULL DEFAULT 'lion',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS session_summaries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        room_code VARCHAR(12) NOT NULL,
        game_type VARCHAR(30) NOT NULL DEFAULT 'blackjack',
        started_at TIMESTAMP NOT NULL,
        ended_at TIMESTAMP NOT NULL DEFAULT NOW(),
        rounds INTEGER NOT NULL,
        hands_played INTEGER,
        host_user_id UUID REFERENCES users(id) ON DELETE SET NULL
      );

      ALTER TABLE session_summaries ADD COLUMN IF NOT EXISTS game_type VARCHAR(30) NOT NULL DEFAULT 'blackjack';
      ALTER TABLE session_summaries ADD COLUMN IF NOT EXISTS hands_played INTEGER;

      CREATE TABLE IF NOT EXISTS session_player_results (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL REFERENCES session_summaries(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        display_name VARCHAR(50) NOT NULL,
        total_buy_in INTEGER NOT NULL,
        final_stack INTEGER NOT NULL,
        net INTEGER NOT NULL,
        rounds_played INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS room_snapshots (
        room_code VARCHAR(12) PRIMARY KEY,
        snapshot_json TEXT NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  }
}

// ── Service Initialization ───────────────────────────────────────────────────

const dbUrl = process.env["DATABASE_URL"];

export const dbService: DatabaseService =
  dbUrl && !dbUrl.includes("dummy") && !dbUrl.includes("change-me")
    ? new PostgresDatabaseService(dbUrl)
    : new InMemoryDatabaseService();
