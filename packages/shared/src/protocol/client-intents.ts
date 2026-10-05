import { z } from "zod";
import { PartialRoomConfigSchema } from "../types/config.js";

// ─── Base ─────────────────────────────────────────────────────────────────────

const BaseIntent = z.object({
  /** Idempotency key — the server deduplicates on this. */
  actionId: z.string().uuid(),
});

// ─── Room ──────────────────────────────────────────────────────────────────────

export const RoomCreateSchema = BaseIntent.extend({
  type: z.literal("room:create"),
  displayName: z.string().min(1).max(30),
  avatarId: z.string(),
  config: PartialRoomConfigSchema.optional(),
});

export const RoomJoinSchema = BaseIntent.extend({
  type: z.literal("room:join"),
  code: z.string().length(6),
  displayName: z.string().min(1).max(30),
  avatarId: z.string(),
  token: z.string().optional(),
  password: z.string().optional(),
});

export const RoomLeaveSchema = BaseIntent.extend({ type: z.literal("room:leave") });

// ─── Chat ─────────────────────────────────────────────────────────────────────

export const ChatSendSchema = BaseIntent.extend({
  type: z.literal("chat:send"),
  text: z.string().min(1).max(300),
});

// ─── Betting ──────────────────────────────────────────────────────────────────

export const BetAddSchema = BaseIntent.extend({
  type: z.literal("bet:add"),
  amount: z.number().int().positive(),
});
export const BetUndoSchema = BaseIntent.extend({ type: z.literal("bet:undo") });
export const BetClearSchema = BaseIntent.extend({ type: z.literal("bet:clear") });
export const BetRepeatSchema = BaseIntent.extend({ type: z.literal("bet:repeat") });
export const BetLockSchema = BaseIntent.extend({ type: z.literal("bet:lock") });
export const BetSitOutSchema = BaseIntent.extend({ type: z.literal("bet:sitOut") });

// ─── Play ─────────────────────────────────────────────────────────────────────

export const PlayHitSchema = BaseIntent.extend({
  type: z.literal("play:hit"),
  handId: z.string(),
});
export const PlayStandSchema = BaseIntent.extend({
  type: z.literal("play:stand"),
  handId: z.string(),
});
export const PlayDoubleSchema = BaseIntent.extend({
  type: z.literal("play:double"),
  handId: z.string(),
});
export const PlaySplitSchema = BaseIntent.extend({
  type: z.literal("play:split"),
  handId: z.string(),
});
export const PlayInsuranceSchema = BaseIntent.extend({
  type: z.literal("play:insurance"),
  handId: z.string(),
  accept: z.boolean(),
});

// ─── Dealer ───────────────────────────────────────────────────────────────────

export const DealerDealSchema = BaseIntent.extend({ type: z.literal("dealer:deal") });
export const DealerRevealSchema = BaseIntent.extend({ type: z.literal("dealer:reveal") });
export const DealerDrawSchema = BaseIntent.extend({ type: z.literal("dealer:draw") });
export const DealerNextRoundSchema = BaseIntent.extend({ type: z.literal("dealer:nextRound") });
export const DealerShuffleSchema = BaseIntent.extend({ type: z.literal("dealer:shuffle") });

// ─── Host ─────────────────────────────────────────────────────────────────────

export const HostSetDealerSchema = BaseIntent.extend({
  type: z.literal("host:setDealer"),
  targetId: z.string(),
});
export const HostAssignSeatSchema = BaseIntent.extend({
  type: z.literal("host:assignSeat"),
  targetId: z.string(),
  seat: z.number().int().min(1).max(7).nullable(),
});
export const HostKickSchema = BaseIntent.extend({
  type: z.literal("host:kick"),
  targetId: z.string(),
});
export const HostAdjustChipsSchema = BaseIntent.extend({
  type: z.literal("host:adjustChips"),
  target: z.string(),
  op: z.enum(["set", "add", "subtract"]),
  amount: z.number().int().nonnegative(),
});
export const HostUpdateConfigSchema = BaseIntent.extend({
  type: z.literal("host:updateConfig"),
  config: z.record(z.unknown()),
});
export const HostStartSessionSchema = BaseIntent.extend({ type: z.literal("host:startSession") });
export const HostPauseSchema = BaseIntent.extend({ type: z.literal("host:pause") });
export const HostResumeSchema = BaseIntent.extend({ type: z.literal("host:resume") });
export const HostEndSessionSchema = BaseIntent.extend({ type: z.literal("host:endSession") });
export const HostTransferHostSchema = BaseIntent.extend({
  type: z.literal("host:transferHost"),
  targetId: z.string(),
});
export const HostApproveRebuySchema = BaseIntent.extend({
  type: z.literal("host:approveRebuy"),
  targetId: z.string(),
});

// ─── Seat / Rebuy ─────────────────────────────────────────────────────────────

export const SeatSitSchema = BaseIntent.extend({
  type: z.literal("seat:sit"),
  seat: z.number().int().min(1).max(7),
});
export const SeatStandSchema = BaseIntent.extend({ type: z.literal("seat:stand") });
export const RebuyRequestSchema = BaseIntent.extend({ type: z.literal("rebuy:request") });

export const ClientIntentSchemas = {
  "room:create": RoomCreateSchema,
  "room:join": RoomJoinSchema,
  "room:leave": RoomLeaveSchema,
  "chat:send": ChatSendSchema,
  "bet:add": BetAddSchema,
  "bet:undo": BetUndoSchema,
  "bet:clear": BetClearSchema,
  "bet:repeat": BetRepeatSchema,
  "bet:lock": BetLockSchema,
  "bet:sitOut": BetSitOutSchema,
  "play:hit": PlayHitSchema,
  "play:stand": PlayStandSchema,
  "play:double": PlayDoubleSchema,
  "play:split": PlaySplitSchema,
  "play:insurance": PlayInsuranceSchema,
  "dealer:deal": DealerDealSchema,
  "dealer:reveal": DealerRevealSchema,
  "dealer:draw": DealerDrawSchema,
  "dealer:nextRound": DealerNextRoundSchema,
  "dealer:shuffle": DealerShuffleSchema,
  "host:setDealer": HostSetDealerSchema,
  "host:assignSeat": HostAssignSeatSchema,
  "host:kick": HostKickSchema,
  "host:adjustChips": HostAdjustChipsSchema,
  "host:updateConfig": HostUpdateConfigSchema,
  "host:startSession": HostStartSessionSchema,
  "host:pause": HostPauseSchema,
  "host:resume": HostResumeSchema,
  "host:endSession": HostEndSessionSchema,
  "host:transferHost": HostTransferHostSchema,
  "host:approveRebuy": HostApproveRebuySchema,
  "seat:sit": SeatSitSchema,
  "seat:stand": SeatStandSchema,
  "rebuy:request": RebuyRequestSchema,
} as const;

export type IntentType = keyof typeof ClientIntentSchemas;
export type RoomCreateIntent = z.infer<typeof RoomCreateSchema>;
export type RoomJoinIntent = z.infer<typeof RoomJoinSchema>;
export type RoomLeaveIntent = z.infer<typeof RoomLeaveSchema>;
export type ChatSendIntent = z.infer<typeof ChatSendSchema>;
export type BetAddIntent = z.infer<typeof BetAddSchema>;
export type BetUndoIntent = z.infer<typeof BetUndoSchema>;
export type BetClearIntent = z.infer<typeof BetClearSchema>;
export type BetRepeatIntent = z.infer<typeof BetRepeatSchema>;
export type BetLockIntent = z.infer<typeof BetLockSchema>;
export type BetSitOutIntent = z.infer<typeof BetSitOutSchema>;
export type PlayHitIntent = z.infer<typeof PlayHitSchema>;
export type PlayStandIntent = z.infer<typeof PlayStandSchema>;
export type PlayDoubleIntent = z.infer<typeof PlayDoubleSchema>;
export type PlaySplitIntent = z.infer<typeof PlaySplitSchema>;
export type PlayInsuranceIntent = z.infer<typeof PlayInsuranceSchema>;
export type DealerDealIntent = z.infer<typeof DealerDealSchema>;
export type DealerRevealIntent = z.infer<typeof DealerRevealSchema>;
export type DealerDrawIntent = z.infer<typeof DealerDrawSchema>;
export type DealerNextRoundIntent = z.infer<typeof DealerNextRoundSchema>;
export type DealerShuffleIntent = z.infer<typeof DealerShuffleSchema>;
export type HostSetDealerIntent = z.infer<typeof HostSetDealerSchema>;
export type HostAssignSeatIntent = z.infer<typeof HostAssignSeatSchema>;
export type HostKickIntent = z.infer<typeof HostKickSchema>;
export type HostAdjustChipsIntent = z.infer<typeof HostAdjustChipsSchema>;
export type HostUpdateConfigIntent = z.infer<typeof HostUpdateConfigSchema>;
export type HostStartSessionIntent = z.infer<typeof HostStartSessionSchema>;
export type HostPauseIntent = z.infer<typeof HostPauseSchema>;
export type HostResumeIntent = z.infer<typeof HostResumeSchema>;
export type HostEndSessionIntent = z.infer<typeof HostEndSessionSchema>;
export type HostTransferHostIntent = z.infer<typeof HostTransferHostSchema>;
export type HostApproveRebuyIntent = z.infer<typeof HostApproveRebuySchema>;
export type SeatSitIntent = z.infer<typeof SeatSitSchema>;
export type SeatStandIntent = z.infer<typeof SeatStandSchema>;
export type RebuyRequestIntent = z.infer<typeof RebuyRequestSchema>;
