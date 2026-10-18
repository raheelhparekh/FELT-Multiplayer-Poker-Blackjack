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
  buyIn: z.number().int().positive().optional(),
  gameType: z.enum(["blackjack", "poker"]).optional().default("blackjack"),
  config: PartialRoomConfigSchema.optional(),
});

export const RoomJoinSchema = BaseIntent.extend({
  type: z.literal("room:join"),
  code: z.string().length(6),
  displayName: z.string().min(1).max(30),
  avatarId: z.string(),
  buyIn: z.number().int().positive().optional(),
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
  seat: z.number().int().min(1).max(9).nullable(),
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
  seat: z.number().int().min(1).max(9),
});
export const SeatStandSchema = BaseIntent.extend({ type: z.literal("seat:stand") });
export const RebuyRequestSchema = BaseIntent.extend({
  type: z.literal("rebuy:request"),
  amount: z.number().int().positive().optional(),
});

// ─── Poker ────────────────────────────────────────────────────────────────────

export const PokerFoldSchema = BaseIntent.extend({ type: z.literal("poker:fold") });
export const PokerCheckSchema = BaseIntent.extend({ type: z.literal("poker:check") });
export const PokerCallSchema = BaseIntent.extend({ type: z.literal("poker:call") });
export const PokerBetSchema = BaseIntent.extend({
  type: z.literal("poker:bet"),
  amount: z.number().int().positive(),
});
export const PokerRaiseSchema = BaseIntent.extend({
  type: z.literal("poker:raise"),
  to: z.number().int().positive().optional(),
  amount: z.number().int().positive().optional(),
});
export const PokerAllInSchema = BaseIntent.extend({ type: z.literal("poker:allIn") });
export const PokerShowCardsSchema = BaseIntent.extend({ type: z.literal("poker:showCards") });
export const PokerDealNextStreetSchema = BaseIntent.extend({ type: z.literal("poker:dealNextStreet") });
export const PokerNextHandSchema = BaseIntent.extend({ type: z.literal("poker:nextHand") });
export const PokerStartHandSchema = BaseIntent.extend({ type: z.literal("poker:startHand") });
export const PokerSitOutSchema = BaseIntent.extend({ type: z.literal("poker:sitOut") });
export const PokerSitInSchema = BaseIntent.extend({ type: z.literal("poker:sitIn") });
export const PokerActionSchema = BaseIntent.extend({
  type: z.literal("poker:action"),
  action: z.enum(["fold", "check", "call", "bet", "raise", "allIn"]),
  amount: z.number().int().positive().optional(),
  to: z.number().int().positive().optional(),
});

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
  "poker:fold": PokerFoldSchema,
  "poker:check": PokerCheckSchema,
  "poker:call": PokerCallSchema,
  "poker:bet": PokerBetSchema,
  "poker:raise": PokerRaiseSchema,
  "poker:allIn": PokerAllInSchema,
  "poker:showCards": PokerShowCardsSchema,
  "poker:dealNextStreet": PokerDealNextStreetSchema,
  "poker:nextHand": PokerNextHandSchema,
  "poker:startHand": PokerStartHandSchema,
  "poker:sitOut": PokerSitOutSchema,
  "poker:sitIn": PokerSitInSchema,
  "poker:action": PokerActionSchema,
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
export type PokerFoldIntent = z.infer<typeof PokerFoldSchema>;
export type PokerCheckIntent = z.infer<typeof PokerCheckSchema>;
export type PokerCallIntent = z.infer<typeof PokerCallSchema>;
export type PokerBetIntent = z.infer<typeof PokerBetSchema>;
export type PokerRaiseIntent = z.infer<typeof PokerRaiseSchema>;
export type PokerAllInIntent = z.infer<typeof PokerAllInSchema>;
export type PokerShowCardsIntent = z.infer<typeof PokerShowCardsSchema>;
export type PokerDealNextStreetIntent = z.infer<typeof PokerDealNextStreetSchema>;
export type PokerNextHandIntent = z.infer<typeof PokerNextHandSchema>;
export type PokerStartHandIntent = z.infer<typeof PokerStartHandSchema>;
export type PokerSitOutIntent = z.infer<typeof PokerSitOutSchema>;
export type PokerSitInIntent = z.infer<typeof PokerSitInSchema>;
export type PokerActionIntent = z.infer<typeof PokerActionSchema>;
