import { describe, expect, it } from "vitest";
import type { Card } from "../../types/index.js";
import { evaluateHand, formatHandValue } from "../hand-value.js";

const c = (rank: Card["rank"], suit: Card["suit"] = "hearts"): Card => ({ rank, suit });

describe("evaluateHand — Phase 0 smoke tests", () => {
  it("counts number cards at face value", () => {
    expect(evaluateHand([c("7"), c("8")]).total).toBe(15);
  });

  it("J/Q/K = 10", () => {
    expect(evaluateHand([c("J"), c("Q")]).total).toBe(20);
  });

  it("Ace + 7 = soft 18", () => {
    const hv = evaluateHand([c("A"), c("7")]);
    expect(hv.total).toBe(18);
    expect(hv.isSoft).toBe(true);
  });

  it("Ace + 7 + 8 = hard 16 (ace drops to 1)", () => {
    const hv = evaluateHand([c("A"), c("7"), c("8")]);
    expect(hv.total).toBe(16);
    expect(hv.isSoft).toBe(false);
  });

  it("Ace + Ace = soft 12", () => {
    const hv = evaluateHand([c("A"), c("A")]);
    expect(hv.total).toBe(12);
    expect(hv.isSoft).toBe(true);
  });

  it("Ace + K = blackjack", () => {
    const hv = evaluateHand([c("A"), c("K")]);
    expect(hv.total).toBe(21);
    expect(hv.isBlackjack).toBe(true);
  });

  it("3 cards totalling 21 is NOT blackjack", () => {
    const hv = evaluateHand([c("7"), c("7"), c("7")]);
    expect(hv.total).toBe(21);
    expect(hv.isBlackjack).toBe(false);
  });

  it("detects bust", () => {
    const hv = evaluateHand([c("10"), c("J"), c("Q")]);
    expect(hv.isBust).toBe(true);
    expect(hv.total).toBe(30);
  });

  it("formats soft hand as X/Y", () => {
    const hv = evaluateHand([c("A"), c("7")]);
    expect(formatHandValue(hv)).toBe("8/18");
  });

  it("formats hard hand as N", () => {
    const hv = evaluateHand([c("10"), c("9")]);
    expect(formatHandValue(hv)).toBe("19");
  });
});
