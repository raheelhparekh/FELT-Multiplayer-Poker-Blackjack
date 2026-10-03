import { z } from "zod";

// Server → Client message schemas.
// Full payloads documented in docs/PROTOCOL.md (Phase 2).

export const ServerErrorSchema = z.object({
  type: z.literal("error"),
  code: z.string(),
  message: z.string(),
  actionId: z.string().optional(),
});

export const ServerSnapshotSchema = z.object({
  type: z.literal("snapshot"),
  seq: z.number().int(),
  // The full view payload is typed via ClientGameView — defined in engine/view-for.ts
  data: z.unknown(),
});

export const ServerEventBatchSchema = z.object({
  type: z.literal("events"),
  seq: z.number().int(),
  events: z.array(z.unknown()),
});

export const ServerPresenceSchema = z.object({
  type: z.literal("presence"),
  playerId: z.string(),
  isConnected: z.boolean(),
});

export const ServerChatSchema = z.object({
  type: z.literal("chat"),
  message: z.object({
    seq: z.number().int(),
    ts: z.number(),
    senderId: z.string(),
    senderName: z.string(),
    text: z.string(),
  }),
});

export const ServerActivitySchema = z.object({
  type: z.literal("activity"),
  entry: z.object({
    seq: z.number().int(),
    ts: z.number(),
    text: z.string(),
  }),
});

export type ServerError = z.infer<typeof ServerErrorSchema>;
export type ServerSnapshot = z.infer<typeof ServerSnapshotSchema>;
export type ServerEventBatch = z.infer<typeof ServerEventBatchSchema>;
export type ServerPresence = z.infer<typeof ServerPresenceSchema>;
export type ServerChat = z.infer<typeof ServerChatSchema>;
export type ServerActivity = z.infer<typeof ServerActivitySchema>;
