import { integer, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  username: varchar("username", { length: 50 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  avatarId: varchar("avatar_id", { length: 50 }).notNull().default("lion"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sessionSummaries = pgTable("session_summaries", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomCode: varchar("room_code", { length: 12 }).notNull(),
  gameType: varchar("game_type", { length: 30 }).notNull().default("blackjack"),
  startedAt: timestamp("started_at").notNull(),
  endedAt: timestamp("ended_at").defaultNow().notNull(),
  rounds: integer("rounds").notNull(),
  handsPlayed: integer("hands_played"),
  hostUserId: uuid("host_user_id").references(() => users.id, { onDelete: "set null" }),
});

export const sessionPlayerResults = pgTable("session_player_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .references(() => sessionSummaries.id, { onDelete: "cascade" })
    .notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  displayName: varchar("display_name", { length: 50 }).notNull(),
  totalBuyIn: integer("total_buy_in").notNull(),
  finalStack: integer("final_stack").notNull(),
  net: integer("net").notNull(),
  roundsPlayed: integer("rounds_played").notNull(),
});

export const roomSnapshots = pgTable("room_snapshots", {
  roomCode: varchar("room_code", { length: 12 }).primaryKey(),
  snapshotJson: text("snapshot_json").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type SessionSummary = typeof sessionSummaries.$inferSelect;
export type NewSessionSummary = typeof sessionSummaries.$inferInsert;
export type SessionPlayerResult = typeof sessionPlayerResults.$inferSelect;
export type NewSessionPlayerResult = typeof sessionPlayerResults.$inferInsert;
export type RoomSnapshot = typeof roomSnapshots.$inferSelect;
export type NewRoomSnapshot = typeof roomSnapshots.$inferInsert;
