import { describe, expect, it } from "vitest";
import { RoomConfigSchema, defaultRoomConfig } from "../../types/config.js";

describe("RoomConfig schema — Phase 0 smoke tests", () => {
  it("parses valid defaults without error", () => {
    expect(() => defaultRoomConfig()).not.toThrow();
  });

  it("rejects minBet > maxBet", () => {
    const result = RoomConfigSchema.safeParse({ minBet: 500, maxBet: 100 });
    expect(result.success).toBe(false);
  });

  it("rejects a denomination smaller than minBet", () => {
    const result = RoomConfigSchema.safeParse({
      minBet: 100,
      maxBet: 1000,
      chipDenominations: [25, 100, 500],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid custom config", () => {
    const result = RoomConfigSchema.safeParse({
      decks: 2,
      penetration: 0.6,
      blackjackPayout: "6:5",
      minBet: 100,
      maxBet: 500,
      chipDenominations: [100, 200, 500],
    });
    expect(result.success).toBe(true);
  });
});
