import type { ClientCard, ClientGameView, ClientHand } from "@felt/shared";
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

export function useTableChoreography(currentView: ClientGameView | null): TableChoreographyState {
  const animationSpeed = useSettingsStore((s) => s.animationSpeed);

  // Cards dealt count per hand
  const [dealtCardsPerHand, setDealtCardsPerHand] = useState<Record<string, number>>({});
  // Number of cards to show for the dealer
  const [dealerCardCount, setDealerCardCount] = useState<number>(0);
  const [isHoleCardRevealed, setIsHoleCardRevealed] = useState<boolean>(false);
  const [isFlippingHole, setIsFlippingHole] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showOutcomes, setShowOutcomes] = useState<boolean>(false);

  // Ref tracking to prevent re-running animations for the same round
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

    // ─── 2. Initial Deal Choreography (Pass 1 then Pass 2 across the table) ─────
    const isNewDeal = hands.length > 0 && hasDealtThisRoundRef.current !== roundNumber;

    if (isNewDeal) {
      clearTimers();
      hasDealtThisRoundRef.current = roundNumber;
      hasSuspensedThisRoundRef.current = -1;
      setShowOutcomes(false);
      setIsHoleCardRevealed(false);
      setIsFlippingHole(false);

      if (animationSpeed === 0) {
        // Instant mode
        const allDealt: Record<string, number> = {};
        for (const h of hands) allDealt[h.id] = h.cards.length;
        setDealtCardsPerHand(allDealt);
        setDealerCardCount(dealerHand?.cards.length ?? 0);
        setStatusMessage(null);
      } else {
        // Realistic Casino Pass 1 & Pass 2 Deal Rhythm
        // Step delay: ~260ms per card dealt
        const stepDelay = Math.round(260 / speedFactor);
        const sortedHands = [...hands].sort((a, b) => a.seatNumber - b.seatNumber);

        setStatusMessage("Dealing cards...");

        // Initialize with 0 cards visible
        const counts: Record<string, number> = {};
        for (const h of sortedHands) counts[h.id] = 0;
        setDealtCardsPerHand({ ...counts });
        setDealerCardCount(0);

        let curTime = 60;

        // --- PASS 1: Deal 1st card to each player, then 1st card (up-card) to dealer ---
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

        // Dealer 1st card (Face-up)
        const tDealer1 = setTimeout(() => {
          setDealerCardCount(1);
          soundEngine.play("card_deal");
        }, curTime);
        timersRef.current.push(tDealer1);
        curTime += stepDelay;

        // --- PASS 2: Deal 2nd card to each player, then 2nd card (hole card) to dealer ---
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

        // Dealer 2nd card (Face-down hole card)
        const tDealer2 = setTimeout(() => {
          setDealerCardCount(2);
          soundEngine.play("card_deal");
          setStatusMessage(null);
        }, curTime);
        timersRef.current.push(tDealer2);
      }
      return;
    }

    // ─── 3. Player Turns Phase (Handle hits, double downs, splits) ──────────────
    if (
      phase === "dealing" ||
      phase === "insurance" ||
      phase === "peek" ||
      phase === "player_turns"
    ) {
      // Sync player hands card counts (e.g. when player hits, 3rd card appears)
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

      // Dealer remains showing 2 cards (up-card + hidden hole card)
      setDealerCardCount((prev) => (prev < 2 ? 2 : prev));
      setIsHoleCardRevealed(false);
      setIsFlippingHole(false);
      setShowOutcomes(false);
      return;
    }

    // ─── 4. Dealer Turn & Settlement Suspense (Card by card reveal) ──────────────
    if (phase === "dealer_turn" || phase === "settlement" || phase === "round_summary") {
      const fullDealerCards = dealerHand?.cards ?? [];
      const holeSlot = fullDealerCards[1];
      const isServerHoleRevealed =
        fullDealerCards.length >= 2 && Boolean(holeSlot && "card" in holeSlot);

      if (!isServerHoleRevealed) {
        // Hole card not yet revealed by server
        return;
      }

      // If instant animation mode: show immediately
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

      // If we already finished dealer suspense for this round, show full outcome
      if (hasSuspensedThisRoundRef.current === roundNumber) {
        setDealerCardCount(fullDealerCards.length);
        setIsHoleCardRevealed(true);
        setShowOutcomes(true);
        return;
      }

      // ── START DEALER SUSPENSE CHOREOGRAPHY ──
      clearTimers();
      hasSuspensedThisRoundRef.current = roundNumber;
      setShowOutcomes(false);

      const baseFlipPause = Math.round(1100 / speedFactor);
      const baseDrawPause = Math.round(1200 / speedFactor);
      const baseResolutionPause = Math.round(900 / speedFactor);

      // Step 1: Reveal hole card (Card 1 flips face-up)
      setIsHoleCardRevealed(true);
      setIsFlippingHole(true);
      setDealerCardCount(2);
      soundEngine.play("card_flip");
      setStatusMessage("Dealer reveals hole card...");

      let cumDelay = baseFlipPause;

      // Step 2..N: Draw subsequent cards one by one (Card 3, Card 4, etc.)
      if (fullDealerCards.length > 2) {
        for (let i = 2; i < fullDealerCards.length; i++) {
          const targetCount = i + 1;

          const t = setTimeout(() => {
            setIsFlippingHole(false);
            setStatusMessage("Dealer must draw...");
            setDealerCardCount(targetCount);
            soundEngine.play("card_deal");
          }, cumDelay);

          timersRef.current.push(t);
          cumDelay += baseDrawPause;
        }
      }

      // Step Final: Dealer Verdict Announcement
      const tVerdict = setTimeout(() => {
        setIsFlippingHole(false);
        setDealerCardCount(fullDealerCards.length);

        // Calculate final total
        const cardObjects = fullDealerCards.flatMap((c) => ("card" in c ? [c.card] : []));
        let total = 0;
        let aces = 0;
        for (const c of cardObjects) {
          if (c.rank === "A") {
            aces++;
            total += 11;
          } else if (["K", "Q", "J", "10"].includes(c.rank)) {
            total += 10;
          } else {
            total += Number(c.rank);
          }
        }
        while (total > 21 && aces > 0) {
          total -= 10;
          aces--;
        }

        if (total > 21) {
          setStatusMessage(`Dealer Busts with ${total}!`);
          soundEngine.play("bust");
        } else if (total === 21 && fullDealerCards.length === 2) {
          setStatusMessage("Dealer has Blackjack!");
          soundEngine.play("blackjack");
        } else {
          setStatusMessage(`Dealer stands on ${total}.`);
        }
      }, cumDelay);
      timersRef.current.push(tVerdict);

      cumDelay += baseResolutionPause;

      // Step Complete: Reveal Outcomes to all players!
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
    if (cards.length === 0 || dealerCardCount === 0) return [];

    if (dealerCardCount === 1) {
      return [cards[0]!];
    }

    // Dealer has >= 2 cards:
    if (!isHoleCardRevealed) {
      // Hole card is face-down
      return [cards[0]!, { hidden: true } satisfies ClientCard];
    }

    // Hole card is face-up: return cards up to dealerCardCount
    return cards.slice(0, dealerCardCount);
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
