import { z } from "zod";

export const TABLE_THEMES = [
  "classic-green",
  "royal-blue",
  "ruby-red",
  "midnight-onyx",
  "imperial-purple",
] as const;

export type TableTheme = (typeof TABLE_THEMES)[number];

export const BaseRoomConfigSchema = z.object({
  maxPlayerSeats: z.number().int().min(1).max(7).default(7),
  decks: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(6), z.literal(8)]).default(6),
  penetration: z.number().min(0.5).max(0.9).default(0.75),
  dealerHitsSoft17: z.boolean().default(false),
  blackjackPayout: z.enum(["3:2", "6:5"]).default("3:2"),
  doubleRestriction: z.enum(["any", "9-11"]).default("9-11"),
  doubleAfterSplit: z.boolean().default(true),
  maxSplitHands: z.number().int().min(2).max(4).default(4),
  splitBy: z.enum(["value", "rank"]).default("value"),
  resplitAces: z.boolean().default(false),
  insuranceEnabled: z.boolean().default(true),
  chipDenominations: z.array(z.number().int().positive()).min(1).default([50, 100, 200, 500, 1000]),
  minBet: z.number().int().positive().default(50),
  maxBet: z.number().int().positive().max(5000).default(1000),
  startingStack: z.number().int().min(100).max(20000).default(5000),
  dealerStartingBank: z.number().int().positive().default(50000),
  rebuyEnabled: z.boolean().default(true),
  rebuyAmount: z.number().int().min(100).max(20000).default(5000),
  rebuyRequiresHostApproval: z.boolean().default(true),
  betTimerSec: z.number().int().positive().nullable().default(30),
  actionTimerSec: z.number().int().positive().nullable().default(30),
  dealerDrawMode: z.enum(["auto", "manual"]).default("auto"),
  spectatorsCanChat: z.boolean().default(true),
  maxSpectators: z.number().int().min(0).max(50).default(20),
  tableTheme: z.enum(TABLE_THEMES).default("classic-green"),
});

export const PartialRoomConfigSchema = BaseRoomConfigSchema.partial();

export const RoomConfigSchema = BaseRoomConfigSchema.superRefine((cfg, ctx) => {
  // minBet must not exceed maxBet
  if (cfg.minBet > cfg.maxBet) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "minBet must be ≤ maxBet",
      path: ["minBet"],
    });
  }
  // maxBet hard cap: 5,000 max
  if (cfg.maxBet > 5000) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "maxBet cannot exceed 5,000 chips",
      path: ["maxBet"],
    });
  }
  // startingStack hard cap: 20,000 max
  if (cfg.startingStack > 20000) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "startingStack cannot exceed 20,000 chips",
      path: ["startingStack"],
    });
  }
  // rebuyAmount hard cap: 20,000 max
  if (cfg.rebuyAmount > 20000) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "rebuyAmount cannot exceed 20,000 chips",
      path: ["rebuyAmount"],
    });
  }
  // Every denomination must be ≥ minBet
  for (const denom of cfg.chipDenominations) {
    if (denom < cfg.minBet) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Chip denomination ${denom} is smaller than minBet ${cfg.minBet}`,
        path: ["chipDenominations"],
      });
    }
  }
  // maxBet must be reachable with the provided denominations
  const maxReachable = Math.max(...cfg.chipDenominations) * 100;
  if (cfg.maxBet > maxReachable) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "maxBet is unreachably large given chip denominations",
      path: ["maxBet"],
    });
  }
});

export type RoomConfig = z.infer<typeof RoomConfigSchema>;

/** Produce a fully-defaulted RoomConfig. */
export function defaultRoomConfig(): RoomConfig {
  return RoomConfigSchema.parse({});
}
