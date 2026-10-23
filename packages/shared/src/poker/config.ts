import { z } from "zod";
import { TABLE_THEMES } from "../types/config.js";

export const BasePokerConfigSchema = z.object({
  smallBlind: z.number().int().positive().default(25),
  bigBlind: z.number().int().positive().default(50),
  chipUnit: z.number().int().positive().default(25),
  minBuyIn: z.number().int().positive().default(1000),
  maxBuyIn: z.number().int().positive().default(10000),
  maxPlayerSeats: z.number().int().min(2).max(9).default(6),
  actionTimerSec: z.number().int().positive().nullable().default(30),
  timeBankSec: z.number().int().min(0).max(120).default(60),
  autoNextHandDelaySec: z.number().int().min(2).max(30).default(6),
  dealerMode: z.enum(["auto", "human"]).default("auto"),
  rakePercent: z.number().min(0).max(10).default(0),
  spectatorsCanChat: z.boolean().default(true),
  maxSpectators: z.number().int().min(0).max(50).default(20),
  tableTheme: z.enum(TABLE_THEMES).default("classic-green"),
  rebuyRequiresHostApproval: z.boolean().default(true),
  rebuyAmount: z.number().int().min(100).max(20000).default(10000),
  rebuyEnabled: z.boolean().default(true),
  startingStack: z.number().int().min(100).max(50000).default(10000),
});

export const PartialPokerConfigSchema = BasePokerConfigSchema.partial();

export const PokerConfigSchema = BasePokerConfigSchema.superRefine((cfg, ctx) => {
  if (cfg.bigBlind < cfg.smallBlind) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Big blind must be ≥ small blind",
      path: ["bigBlind"],
    });
  }
  if (cfg.minBuyIn > cfg.maxBuyIn) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "minBuyIn must be ≤ maxBuyIn",
      path: ["minBuyIn"],
    });
  }
  if (cfg.smallBlind % cfg.chipUnit !== 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Small blind must be a multiple of chip unit",
      path: ["smallBlind"],
    });
  }
  if (cfg.bigBlind % cfg.chipUnit !== 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Big blind must be a multiple of chip unit",
      path: ["bigBlind"],
    });
  }
});

export type PokerConfig = z.infer<typeof PokerConfigSchema>;

export function defaultPokerConfig(): PokerConfig {
  return PokerConfigSchema.parse({});
}
