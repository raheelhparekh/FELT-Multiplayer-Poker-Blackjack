import type { ClientCard, ClientGameView } from "@felt/shared";
import { evaluateHand } from "@felt/shared";
import { useEffect, useRef, useState } from "react";
import { soundEngine } from "../audio/sound-engine";
import { useSettingsStore } from "../store/settings-store";

export interface TableChoreographyState {
  /** Map from handId -> number of cards currently visible on that hand */
  dealtCardsPerHand: Record<string, number>;
  /** Exact dealer cards currently visible on the table */
  displayedDealerCards: ClientCard[];
  /** Whether the hole card is currently executing its 3D flip animation */
  isFlippingHole: boolean;
  /** Whether the dealer hole card has been turned face-up */
  isHoleCardRevealed: boolean;
  /** Live announcement banner text under dealer cards */
  statusMessage: string | null;
  /** Whether hand outcome badges (WIN / LOST / PUSH) and celebrations are visible */
  showOutcomes: boolean;
}

/** Evaluate hand total directly from ClientCard slots (skips hidden/face-down slots). */
function evalFromSlots(slots: ClientCard[]): { total: number; isBust: boolean; isBlackjack: boolean } {
  const cards = slots.flatMap((c) => ("card" in c ? [c.card] : []));
  if (cards.length === 0) return { total: 0, isBust: false, isBlackjack: false };
  const hv = evaluateHand(cards);
  return { total: hv.total, isBust: hv.isBust, isBlackjack: hv.isBlackjack };
}

export function useTableChoreography(currentView: ClientGameView | null): TableChoreographyState {
  const animationSpeed = useSettingsStore((s) => s.animationSpeed);

  const [dealtCardsPerHand, setDealtCardsPerHand] = useState<Record<string, number>>({});
  const [dealerCardCount, setDealerCardCount] = useState<number>(0);
  const [isHoleCardRevealed, setIsHoleCardRevealed] = useState<boolean>(false);
  const [isFlippingHole, setIsFlippingHole] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showOutcomes, setShowOutcomes] = useState<boolean>(false);

  const hasDealtThisRoundRef = useRef<number>(-1);
  const hasSuspensedThisRoundRef = useRef<number>(-1);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  };

  useEffect(() => {
    return () => clearTimers();
  }, []);

  useEffect(() => {
    if (!currentView) {
      clearTimers();
      setDealtCardsPerHand({});
      setDealerCardCount(0);
      setIsHoleCardRevealed(false);
      setIsFlippingHole(false);
      setStatusMessage(null);
      setShowOutcomes(false);
      return;
    }

    const { phase, roundNumber, hands, dealerHand } = currentView;
    const speedFactor = animationSpeed === 0 ? 1 : animationSpeed || 1;

    // ─── 1. Reset on Lobby or Betting Phase ─────────────────────────────────────
    if (phase === "lobby" || phase === "betting") {
      clearTimers();
      hasDealtThisRoundRef.current = -1;
      hasSuspensedThisRoundRef.current = -1;
      setDealtCardsPerHand({});
      setDealerCardCount(0);
      setIsHoleCardRevealed(false);
      setIsFlippingHole(false);
      setStatusMessage(null);
      setShowOutcomes(false);
      return;
    }

    // ─── 2. Initial Deal Choreography ───────────────────────────────────────────
    // Fires once per round when the dealing snapshot first arrives.
    const isNewDeal = hands.length > 0 && hasDealtThisRoundRef.current !== roundNumber;

    if (isNewDeal) {
      clearTimers();
      hasDealtThisRoundRef.current = roundNumber;
      hasSuspensedThisRoundRef.current = -1;
      setShowOutcomes(false);
      setIsHoleCardRevealed(false);
      setIsFlippingHole(false);

      if (animationSpeed === 0) {
        // Instant mode — show everything right away
        const allDealt: Record<string, number> = {};
        for (const h of hands) allDealt[h.id] = h.cards.length;
        setDealtCardsPerHand(allDealt);
        setDealerCardCount(dealerHand?.cards.length ?? 0);
        setStatusMessage(null);
      } else {
        // ── Casino Pass-1 & Pass-2 rhythm ──────────────────────────────────────
        // Pass 1: player1 → player2 → … → dealer up-card
        // Pass 2: player1 → player2 → … → dealer hole card (face-down)
        // Each step: ~240ms — crisp, satisfying, no blank-table period.
        const stepDelay = Math.round(240 / speedFactor);
        const sortedHands = [...hands].sort((a, b) => a.seatNumber - b.seatNumber);

        setStatusMessage("Dealing cards...");
        const counts: Record<string, number> = {};
        for (const h of sortedHands) counts[h.id] = 0;
        setDealtCardsPerHand({ ...counts });
        setDealerCardCount(0);

        // First card fires at t=0 — table is never blank
        let curTime = 0;

        // PASS 1: one card per player seat (L→R), then dealer up-card
        for (const h of sortedHands) {
          const handId = h.id;
          const t = setTimeout(() => {
            counts[handId] = 1;
            setDealtCardsPerHand({ ...counts });
            soundEngine.play("card_deal");
          }, curTime);
          timersRef.current.push(t);
          curTime += stepDelay;
        }
        const tDealer1 = setTimeout(() => {
          setDealerCardCount(1);
          soundEngine.play("card_deal");
        }, curTime);
        timersRef.current.push(tDealer1);
        curTime += stepDelay;

        // PASS 2: second card per player seat (L→R), then dealer hole card (face-down)
        for (const h of sortedHands) {
          const handId = h.id;
          const t = setTimeout(() => {
            counts[handId] = 2;
            setDealtCardsPerHand({ ...counts });
            soundEngine.play("card_deal");
          }, curTime);
          timersRef.current.push(t);
          curTime += stepDelay;
        }
        const tDealer2 = setTimeout(() => {
          setDealerCardCount(2);
          soundEngine.play("card_deal");
          setStatusMessage(null);
        }, curTime);
        timersRef.current.push(tDealer2);
      }
      return;
    }

    // ─── 3. Player Turns Phase ───────────────────────────────────────────────────
    if (
      phase === "dealing" ||
      phase === "insurance" ||
      phase === "peek" ||
      phase === "player_turns"
    ) {
      // Sync card counts as players hit / double / split (new cards appear immediately)
      setDealtCardsPerHand((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const h of hands) {
          if ((next[h.id] ?? 0) < h.cards.length) {
            next[h.id] = h.cards.length;
            changed = true;
          }
        }
        return changed ? next : prev;
      });

      // Dealer shows exactly 2 cards: up-card + face-down hole card
      setDealerCardCount((prev) => (prev < 2 ? 2 : prev));
      setIsHoleCardRevealed(false);
      setIsFlippingHole(false);
      setShowOutcomes(false);
      return;
    }

    // ─── 4. Dealer Turn & Settlement Suspense ───────────────────────────────────
    if (phase === "dealer_turn" || phase === "settlement" || phase === "round_summary") {
      // Always sync player card counts so hit, doubled, and split cards are never sliced off
      setDealtCardsPerHand((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const h of hands) {
          if ((next[h.id] ?? 0) < h.cards.length) {
            next[h.id] = h.cards.length;
            changed = true;
          }
        }
        return changed ? next : prev;
      });

      const fullDealerCards = dealerHand?.cards ?? [];
      const holeSlot = fullDealerCards[1];
      // Server has revealed the hole card when slot[1] contains a real card identity
      const isServerHoleRevealed =
        fullDealerCards.length >= 2 && Boolean(holeSlot && "card" in holeSlot);

      if (!isServerHoleRevealed) return;

      // Manual dealer draw mode: Dealer controls card-by-card drawing
      if (currentView.config.dealerDrawMode === "manual") {
        clearTimers();
        setIsHoleCardRevealed(true);
        setIsFlippingHole(false);
        setDealerCardCount(fullDealerCards.length);
        if (phase === "dealer_turn") {
          setShowOutcomes(false);
          setStatusMessage(null);
        } else {
          setShowOutcomes(true);
        }
        return;
      }

      // Instant mode
      if (animationSpeed === 0) {
        clearTimers();
        hasSuspensedThisRoundRef.current = roundNumber;
        setDealerCardCount(fullDealerCards.length);
        setIsHoleCardRevealed(true);
        setIsFlippingHole(false);
        setStatusMessage(null);
        setShowOutcomes(true);
        return;
      }

      // Already ran the suspense animation for this round — keep final state
      if (hasSuspensedThisRoundRef.current === roundNumber) {
        setDealerCardCount(fullDealerCards.length);
        setIsHoleCardRevealed(true);
        setShowOutcomes(true);
        return;
      }

      // ── BEGIN DEALER SUSPENSE ────────────────────────────────────────────────
      clearTimers();
      hasSuspensedThisRoundRef.current = roundNumber;
      setShowOutcomes(false);

      // Step 1: 3D flip of hole card (index 1)
      setIsFlippingHole(true);
      setIsHoleCardRevealed(true);
      setDealerCardCount(2);
      soundEngine.play("card_flip");

      // Display the two-card total right away so players can read it
      const twoCard = evalFromSlots(fullDealerCards.slice(0, 2));
      setStatusMessage(
        twoCard.isBlackjack ? "Dealer has Blackjack! 🃏" : `Dealer reveals: ${twoCard.total}`,
      );

      const baseFlipPause = Math.round(1000 / speedFactor);   // wait for flip anim
      const baseDrawPause = Math.round(1100 / speedFactor);   // pause between each hit card
      const baseResolutionPause = Math.round(800 / speedFactor); // pause after verdict

      let cumDelay = baseFlipPause;

      // End the 3D flip animation after the flip pause
      const tStopFlip = setTimeout(() => {
        setIsFlippingHole(false);
      }, cumDelay);
      timersRef.current.push(tStopFlip);

      // Step 2..N: Reveal each additional dealer card one by one with a running count
      if (fullDealerCards.length > 2) {
        for (let i = 2; i < fullDealerCards.length; i++) {
          const targetCount = i + 1;
          const ir = evalFromSlots(fullDealerCards.slice(0, targetCount));

          const t = setTimeout(() => {
            setDealerCardCount(targetCount);
            soundEngine.play("card_deal");
            setStatusMessage(
              ir.isBust
                ? `Dealer draws... BUST! 💥 (${ir.total})`
                : `Dealer draws... ${ir.total}`,
            );
          }, cumDelay);
          timersRef.current.push(t);
          cumDelay += baseDrawPause;
        }
      }

      // Step Final: Verdict banner using accurate final total
      const tVerdict = setTimeout(() => {
        setDealerCardCount(fullDealerCards.length);
        const hv = evaluateHand(fullDealerCards.flatMap((c) => ("card" in c ? [c.card] : [])));

        if (hv.isBust) {
          setStatusMessage(`Dealer busts with ${hv.total}! 💥`);
          soundEngine.play("bust");
        } else if (hv.isBlackjack) {
          setStatusMessage("Dealer has Blackjack! 🃏");
          soundEngine.play("blackjack");
        } else {
          setStatusMessage(`Dealer stands on ${hv.total}.`);
        }
      }, cumDelay);
      timersRef.current.push(tVerdict);

      cumDelay += baseResolutionPause;

      // Step Complete: reveal all player WIN / LOST / PUSH badges
      const tComplete = setTimeout(() => {
        setStatusMessage(null);
        setShowOutcomes(true);
      }, cumDelay);
      timersRef.current.push(tComplete);
    }
  }, [currentView, animationSpeed]);

  // ─── Compute Exact Dealer Cards to Display Right Now ────────────────────────
  const displayedDealerCards: ClientCard[] = (() => {
    if (!currentView?.dealerHand) return [];
    const cards = currentView.dealerHand.cards;
    if (cards.length === 0) return [];

    if (dealerCardCount === 1 && cards.length === 1) {
      return [cards[0]!];
    }

    const holeSlot = cards[1];
    const isHoleHiddenByServer = Boolean(
      holeSlot && "hidden" in holeSlot && holeSlot.hidden,
    );

    // If dealer has > 2 cards or server revealed the hole card, always make all cards visible
    if (cards.length > 2 || !isHoleHiddenByServer || isHoleCardRevealed) {
      const count = Math.max(dealerCardCount, cards.length > 2 ? cards.length : 2);
      return cards.slice(0, count);
    }

    // Show upcard + face-down hole card
    return [cards[0]!, { hidden: true } satisfies ClientCard];
  })();

  return {
    dealtCardsPerHand,
    displayedDealerCards,
    isFlippingHole,
    isHoleCardRevealed,
    statusMessage,
    showOutcomes,
  };
}
