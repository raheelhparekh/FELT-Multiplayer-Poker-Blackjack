import type { ClientGameView } from "@felt/shared";
import type React from "react";
import { useEffect, useState } from "react";
import { soundEngine } from "../audio/sound-engine";
import { ChipTray } from "./ChipTray";

interface ActionBarProps {
  view: ClientGameView;
  myPlayerId: string | null;
  selectedChip: number;
  onSelectChip: (amount: number) => void;
  onBetAdd: (amount: number) => void;
  onBetUndo: () => void;
  onBetClear: () => void;
  onBetRepeat: () => void;
  onBetLock: () => void;
  onBetSitOut: () => void;
  onHit: (handId: string) => void;
  onStand: (handId: string) => void;
  onDouble: (handId: string) => void;
  onSplit: (handId: string) => void;
  onInsurance: (handId: string, accept: boolean) => void;
}

export const ActionBar: React.FC<ActionBarProps> = ({
  view,
  myPlayerId,
  selectedChip,
  onSelectChip,
  onBetAdd,
  onBetUndo,
  onBetClear,
  onBetRepeat,
  onBetLock,
  onBetSitOut,
  onHit,
  onStand,
  onDouble,
  onSplit,
  onInsurance,
}) => {
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  // Countdown timer for betDeadline or actionDeadline
  useEffect(() => {
    const deadline = view.phase === "betting" ? view.betDeadline : view.actionDeadline;

    if (!deadline) {
      setTimeLeft(null);
      return;
    }

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setTimeLeft(remaining);

      // Play soft tick during final 5 seconds if it's my turn
      if (remaining <= 5 && remaining > 0) {
        soundEngine.play("timer_tick");
      }
    }, 500);

    return () => clearInterval(interval);
  }, [view.phase, view.betDeadline, view.actionDeadline]);

  if (!myPlayerId) return null;

  const myParticipant = view.participants.find((p) => p.id === myPlayerId);
  const isSeated = myParticipant?.seat !== null;
  const myHands = view.hands.filter((h) => h.playerId === myPlayerId);
  const activeHand = view.hands.find((h) => h.id === view.activeHandId);
  const isMyTurn = activeHand && activeHand.playerId === myPlayerId;

  const handleHit = (handId: string) => {
    soundEngine.play("card_deal");
    onHit(handId);
  };

  const handleStand = (handId: string) => {
    soundEngine.play("chip_place");
    onStand(handId);
  };

  const handleDouble = (handId: string) => {
    soundEngine.play("chip_stack");
    setTimeout(() => soundEngine.play("card_deal"), 150);
    onDouble(handId);
  };

  const handleSplit = (handId: string) => {
    soundEngine.play("chip_stack");
    setTimeout(() => soundEngine.play("card_deal"), 150);
    onSplit(handId);
  };

  const handleInsurance = (handId: string, accept: boolean) => {
    if (accept) {
      soundEngine.play("chip_place");
    }
    onInsurance(handId, accept);
  };

  // 1. Betting Phase
  if (view.phase === "betting") {
    if (!isSeated) {
      return (
        <div className="w-full max-w-xl mx-auto p-3 bg-black/80 rounded-2xl border border-emerald-900/60 text-center text-xs text-emerald-400">
          You are spectating. Take an open seat to join the next round!
        </div>
      );
    }

    const myStack = view.stacks[myPlayerId] ?? 0;
    const lockedAmount = view.lockedBets?.[myPlayerId] ?? 0;
    const isLocked = Boolean(view.lockedBets && view.lockedBets[myPlayerId]);

    if (isLocked) {
      return (
        <div className="w-full max-w-md mx-auto p-3 bg-black/80 rounded-2xl border border-gold-400/40 text-center shadow-lg">
          <span className="text-xs text-gold-300 font-bold block mb-0.5">
            ✓ Bet of ${lockedAmount} is locked in!
          </span>
          <span className="text-[11px] text-emerald-400/60 font-mono">
            Waiting for cards to be dealt... {timeLeft !== null && `(${timeLeft}s)`}
          </span>
        </div>
      );
    }

    const currentBet = view.pendingBets?.[myPlayerId] ?? 0;
    const canLock = currentBet >= view.config.minBet && currentBet <= view.config.maxBet;

    return (
      <div className="w-full max-w-lg mx-auto flex flex-col items-center gap-1">
        <ChipTray
          denominations={view.config.chipDenominations}
          selectedChip={selectedChip}
          onSelectChip={onSelectChip}
          onBetAdd={onBetAdd}
          onBetUndo={onBetUndo}
          onBetClear={onBetClear}
          onBetRepeat={onBetRepeat}
          onBetLock={onBetLock}
          pendingBet={currentBet}
          canLock={canLock}
          minBet={view.config.minBet}
          maxBet={view.config.maxBet}
          disabled={myStack === 0}
        />
        <button
          type="button"
          onClick={onBetSitOut}
          className="text-[11px] text-emerald-500/70 hover:text-white underline mt-0.5"
        >
          Sit out this round
        </button>
      </div>
    );
  }

  // 2. Insurance Phase
  if (view.phase === "insurance") {
    const isPending = view.insurancePending.includes(myPlayerId);
    if (isPending && myHands.length > 0) {
      const hand = myHands[0];
      if (!hand) return null;

      return (
        <div className="w-full max-w-md mx-auto p-4 bg-black/90 rounded-3xl border border-amber-500/60 shadow-2xl flex flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-amber-400 font-bold text-sm">🛡️ Insurance Offered</span>
            {timeLeft !== null && (
              <span className="text-xs font-mono font-bold text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded-full border border-amber-500/40">
                {timeLeft}s
              </span>
            )}
          </div>
          <p className="text-xs text-emerald-200 text-center">
            Dealer is showing an Ace. Would you like to protect your hand against Dealer Blackjack?
          </p>
          <div className="flex items-center gap-3 w-full justify-center">
            <button
              type="button"
              onClick={() => handleInsurance(hand.id, true)}
              className="px-6 py-2.5 rounded-xl bg-gold-400 hover:bg-gold-300 font-black text-xs text-black shadow-lg transition-transform active:scale-95"
            >
              Take Insurance (${Math.floor(hand.bet / 2)})
            </button>
            <button
              type="button"
              onClick={() => handleInsurance(hand.id, false)}
              className="px-6 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 font-bold text-xs text-zinc-300 border border-zinc-700 transition-transform active:scale-95"
            >
              Pass
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="w-full max-w-sm mx-auto p-2.5 bg-black/80 rounded-2xl border border-emerald-900/60 text-center text-xs text-emerald-400">
        Waiting for insurance decisions...
      </div>
    );
  }

  // 3. Player Turns Phase
  if (view.phase === "player_turns") {
    if (!isMyTurn || !activeHand) {
      const activePlayer = view.participants.find((p) => p.id === activeHand?.playerId);
      const activeName = activePlayer ? activePlayer.displayName : "player";

      return (
        <div className="w-full max-w-sm mx-auto p-2.5 bg-black/80 rounded-2xl border border-emerald-900/60 text-center shadow">
          <span className="text-xs text-emerald-300">
            Waiting for <strong className="text-gold-300">{activeName}</strong> to act...
          </span>
        </div>
      );
    }

    // It is MY turn on activeHand!
    const myStack = view.stacks[myPlayerId] ?? 0;
    const canDouble =
      myStack >= activeHand.bet && activeHand.cards.length === 2 && !activeHand.isDoubled;
    const canSplit =
      myStack >= activeHand.bet &&
      activeHand.cards.length === 2 &&
      !activeHand.isSplitAce &&
      activeHand.cards[0] &&
      activeHand.cards[1] &&
      "card" in activeHand.cards[0] &&
      "card" in activeHand.cards[1] &&
      activeHand.cards[0].card.rank === activeHand.cards[1].card.rank;

    return (
      <div className="w-full max-w-md mx-auto p-3 bg-black/90 backdrop-blur-md rounded-3xl border border-gold-400/60 shadow-2xl flex flex-col items-center gap-2.5 animate-turn-pulse">
        <div className="flex items-center justify-between w-full px-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-gold-300 font-black tracking-wide">YOUR TURN!</span>
            {timeLeft !== null && (
              <span className="text-[10px] font-mono font-bold text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded-full border border-amber-500/40">
                {timeLeft}s
              </span>
            )}
          </div>
          <span className="text-emerald-400/80 font-mono">Bet: ${activeHand.bet}</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full">
          <button
            type="button"
            onClick={() => handleHit(activeHand.id)}
            className="py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-sm font-extrabold text-white shadow-lg transition-transform active:scale-95 border border-emerald-400/40"
          >
            Hit
          </button>

          <button
            type="button"
            onClick={() => handleStand(activeHand.id)}
            className="py-3 rounded-2xl bg-rose-800 hover:bg-rose-700 text-sm font-extrabold text-white shadow-lg transition-transform active:scale-95 border border-rose-600/40"
          >
            Stand
          </button>

          <button
            type="button"
            disabled={!canDouble}
            onClick={() => handleDouble(activeHand.id)}
            className="py-3 rounded-2xl bg-amber-600 hover:bg-amber-500 disabled:opacity-30 text-xs sm:text-sm font-extrabold text-white shadow-lg transition-transform active:scale-95 border border-amber-400/40"
          >
            Double (${activeHand.bet})
          </button>

          <button
            type="button"
            disabled={!canSplit}
            onClick={() => handleSplit(activeHand.id)}
            className="py-3 rounded-2xl bg-blue-700 hover:bg-blue-600 disabled:opacity-30 text-xs sm:text-sm font-extrabold text-white shadow-lg transition-transform active:scale-95 border border-blue-500/40"
          >
            Split (${activeHand.bet})
          </button>
        </div>
      </div>
    );
  }

  // 4. Dealer Turn / Settlement / Round Summary
  if (view.phase === "dealer_turn") {
    return (
      <div className="w-full max-w-sm mx-auto p-2.5 bg-black/80 rounded-2xl border border-emerald-900/60 text-center shadow text-xs text-blue-300">
        Dealer playing hand...
      </div>
    );
  }

  if (view.phase === "settlement") {
    return (
      <div className="w-full max-w-sm mx-auto p-2.5 bg-black/80 rounded-2xl border border-emerald-900/60 text-center shadow text-xs text-gold-300 font-bold">
        Settling table bets...
      </div>
    );
  }

  return null;
};
