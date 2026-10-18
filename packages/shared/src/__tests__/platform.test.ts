import { describe, expect, it } from "vitest";
import { BlackjackModule } from "../blackjack-module.js";
import { getGameModule, getRegisteredGameTypes, isGameRegistered } from "../game-registry.js";
import { defaultRoomConfig } from "../types/config.js";

describe("Phase C — Platform Abstraction & GameRegistry", () => {
  it("registers blackjack and poker modules by default", () => {
    expect(isGameRegistered("blackjack")).toBe(true);
    expect(isGameRegistered("poker")).toBe(true);
    expect(isGameRegistered("roulette" as any)).toBe(false);
    expect(getRegisteredGameTypes()).toEqual(["blackjack", "poker"]);

    const mod = getGameModule("blackjack");
    expect(mod.id).toBe("blackjack");
    expect(mod).toBe(BlackjackModule);

    const pokerMod = getGameModule("poker");
    expect(pokerMod.id).toBe("poker");
  });

  it("throws when requesting unregistered game module", () => {
    expect(() => getGameModule("roulette" as any)).toThrow(/Unknown game type: "roulette"/);
  });

  it("BlackjackModule creates valid state conforming to GameModule contract", () => {
    const cfg = defaultRoomConfig();
    const state = BlackjackModule.createState("TEST01", cfg);
    expect(state.roomCode).toBe("TEST01");
    expect(state.phase).toBe("lobby");

    const specs = BlackjackModule.timerSpec(state);
    expect(specs).toEqual([]);

    const invariants = BlackjackModule.invariants(state);
    expect(invariants).toEqual([]);
  });

  it("BlackjackModule computes standings correctly", () => {
    const cfg = defaultRoomConfig();
    const state = BlackjackModule.createState("TEST02", cfg);
    const p1 = { id: "p1", displayName: "Alice", avatarId: "av1", role: "player" as const, seat: 1 as const, isConnected: true, isGuest: false };
    const participants = new Map([[p1.id, p1]]);

    state.stacks.set("p1", 6000);
    state.totalBuyIns.set("p1", 5000);

    const rows = BlackjackModule.standings(state, participants);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      playerId: "p1",
      displayName: "Alice",
      avatarId: "av1",
      stack: 6000,
      totalBuyIn: 5000,
      net: 1000,
      roundsOrHandsPlayed: 0,
    });
  });
});
