import type { Card, ClientGameView, ClientHand, Participant } from "@felt/shared";
import { evaluateHand } from "@felt/shared";
import type React from "react";
import { soundEngine } from "../audio/sound-engine";
import { useCountdownTimer } from "../hooks/useCountdownTimer";
import { useGameStore } from "../store/game-store";
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
  const activeHand = view.hands.find((h: ClientHand) => h.id === view.activeHandId);
  const isMyTurn = Boolean(activeHand && activeHand.playerId === myPlayerId);

  // Active deadline based on current game phase
  const currentDeadline =
    view.phase === "betting"
      ? view.betDeadline
      : view.phase === "insurance"
        ? view.insuranceDeadline
        : view.phase === "player_turns"
          ? view.actionDeadline
          : null;

  const totalDurationSec =
    view.phase === "betting"
      ? (view.config.betTimerSec ?? 30)
      : view.phase === "insurance"
        ? 15
        : (view.config.actionTimerSec ?? 30);

  const timer = useCountdownTimer({
    deadline: currentDeadline,
    isPaused: view.isPaused,
    pausedRemainingMs: view.pausedRemainingMs,
    totalDurationSec,
    playTickAudio: Boolean(isMyTurn && view.phase === "player_turns"),
    resetKey: `${view.phase}-${view.activeHandId ?? ""}-${currentDeadline ?? 0}`,
  });

  if (!myPlayerId) return null;

  const myParticipant = view.participants.find((p: Participant) => p.id === myPlayerId);
  const isSeated = myParticipant?.seat !== null;
  const myHands = view.hands.filter((h: ClientHand) => h.playerId === myPlayerId);

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
          You are spectating. Take an open seat to join the next round!{" "}
          {timer.seconds !== null && (
            <span className="text-gold-300 font-mono">({timer.formatted})</span>
          )}
        </div>
      );
    }

    const myStack = view.stacks[myPlayerId] ?? 0;
    const lockedAmount = view.lockedBets?.[myPlayerId] ?? 0;
    const isLocked = Boolean(view.lockedBets?.[myPlayerId]);

    if (isLocked) {
      return (
        <div className="w-full max-w-md mx-auto p-3 bg-black/80 rounded-2xl border border-gold-400/40 text-center shadow-lg">
          <span className="text-xs text-gold-300 font-bold block mb-0.5">
            ✓ Bet of ₹{lockedAmount} is locked in!
          </span>
          <span className="text-[11px] text-emerald-400/70 font-mono">
            Waiting for cards to be dealt...{" "}
            {timer.seconds !== null && (
              <span className="text-gold-300 font-bold font-mono">({timer.formatted})</span>
            )}
          </span>
          {timer.seconds !== null && (
            <div className="w-48 mx-auto mt-2 h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gold-400 transition-all duration-150"
                style={{ width: `${Math.round(timer.fraction * 100)}%` }}
              />
            </div>
          )}
        </div>
      );
    }

    const currentBet = view.pendingBets?.[myPlayerId] ?? 0;
    const canLock = currentBet >= view.config.minBet && currentBet <= view.config.maxBet;

    return (
      <div className="w-full max-w-lg mx-auto flex flex-col items-center gap-1.5 px-2">
        {/* Live betting timer bar above chips */}
        {timer.seconds !== null && (
          <div className="w-full flex items-center justify-between px-2 text-[11px] font-mono text-emerald-300/80">
            <span className="flex items-center gap-1">
              <span>⏳</span> Place your bets:
            </span>
            <span
              className={`font-bold px-2 py-0.5 rounded-full border ${
                timer.isUrgent
                  ? "bg-rose-950 text-rose-300 border-rose-500 animate-pulse"
                  : "bg-emerald-950/70 text-gold-300 border-emerald-700/50"
              }`}
            >
              {timer.formatted}
            </span>
          </div>
        )}

        {myStack < view.config.minBet && (
          <button
            type="button"
            onClick={() => useGameStore.getState().openModal("rebuy")}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-gold-400 hover:from-amber-400 hover:to-gold-300 text-black font-extrabold text-xs shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2 mb-1"
          >
            <span>🪙</span>
            <span>Out of Chips! Request More from Dealer</span>
          </button>
        )}

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
            {timer.seconds !== null && (
              <span
                className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full border ${
                  timer.isUrgent
                    ? "bg-rose-950 text-rose-300 border-rose-500 animate-pulse"
                    : "bg-amber-950/80 text-amber-300 border-amber-500/40"
                }`}
              >
                ⏱ {timer.formatted}
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
              Take Insurance (₹{Math.floor(hand.bet / 2)})
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
      <div className="w-full max-w-sm mx-auto p-2.5 bg-black/80 rounded-2xl border border-emerald-900/60 text-center text-xs text-emerald-400 flex items-center justify-between px-4">
        <span>Waiting for insurance decisions...</span>
        {timer.seconds !== null && (
          <span className="font-mono font-bold text-amber-300">⏱ {timer.formatted}</span>
        )}
      </div>
    );
  }

  // 3. Player Turns Phase
  if (view.phase === "player_turns") {
    if (isSeated && myHands.length === 0) {
      return (
        <div className="w-full max-w-sm mx-auto p-2.5 bg-black/80 rounded-2xl border border-gold-400/40 text-center shadow">
          <span className="text-xs text-gold-300 font-semibold">
            Seat #{myParticipant?.seat} reserved • You will join when the next round begins!
          </span>
        </div>
      );
    }

    if (!isMyTurn || !activeHand) {
      const activePlayer = view.participants.find(
        (p: Participant) => p.id === activeHand?.playerId,
      );
      const activeName = activePlayer ? activePlayer.displayName : "player";

      return (
        <div className="w-full max-w-sm mx-auto p-2.5 bg-black/80 rounded-2xl border border-emerald-900/60 text-center shadow flex items-center justify-between px-4">
          <span className="text-xs text-emerald-300">
            Waiting for <strong className="text-gold-300">{activeName}</strong> to act...
          </span>
          {timer.seconds !== null && (
            <span
              className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                timer.isUrgent
                  ? "bg-rose-950 text-rose-300 border-rose-500 animate-urgent-timer"
                  : "bg-emerald-950/80 text-emerald-300 border-emerald-500/40"
              }`}
            >
              ⏱ {timer.formatted}
            </span>
          )}
        </div>
      );
    }

    // It is MY turn on activeHand!
    const myStack = view.stacks[myPlayerId] ?? 0;
    const activeCards = activeHand.cards
      .filter((c) => "card" in c)
      .map((c) => (c as { card: Card }).card);
    const hv = evaluateHand(activeCards);
    const isDoubleCountValid =
      view.config.doubleRestriction === "9-11"
        ? !hv.isSoft && (hv.total === 9 || hv.total === 10 || hv.total === 11)
        : true;

    const canDouble =
      myStack >= activeHand.bet &&
      activeHand.cards.length === 2 &&
      !activeHand.isDoubled &&
      isDoubleCountValid;
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
      <div
        className={`w-full max-w-md mx-auto p-3 bg-black/90 backdrop-blur-md rounded-3xl border shadow-2xl flex flex-col items-center gap-2.5 ${
          timer.isUrgent
            ? "border-rose-500/80 shadow-[0_0_25px_rgba(239,68,68,0.3)] animate-urgent-timer"
            : "border-gold-400/60 animate-turn-pulse"
        }`}
      >
        <div className="flex items-center justify-between w-full px-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-gold-300 font-black tracking-wide">YOUR TURN!</span>
            {timer.seconds !== null && (
              <span
                className={`text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full border transition-all ${
                  timer.isUrgent
                    ? "bg-rose-950 text-rose-200 border-rose-400 font-black animate-pulse"
                    : "bg-amber-950/90 text-amber-300 border-amber-500/50"
                }`}
              >
                ⏱ {timer.formatted}
              </span>
            )}
          </div>
          <span className="text-emerald-400/90 font-mono font-semibold">
            Bet: ₹{activeHand.bet}
          </span>
        </div>

        {/* Animated countdown progress bar */}
        {timer.seconds !== null && (
          <div className="w-full h-1 bg-zinc-800/80 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-150 ${
                timer.isUrgent
                  ? "bg-gradient-to-r from-amber-500 to-rose-500"
                  : "bg-gradient-to-r from-emerald-400 to-gold-400"
              }`}
              style={{ width: `${Math.round(timer.fraction * 100)}%` }}
            />
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full">
          <button
            type="button"
            onClick={() => handleHit(activeHand.id)}
            className="py-3 sm:py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-sm font-extrabold text-white shadow-lg transition-transform active:scale-95 border border-emerald-400/40 min-h-[48px] flex items-center justify-center"
          >
            Hit
          </button>

          <button
            type="button"
            onClick={() => handleStand(activeHand.id)}
            className="py-3 sm:py-3.5 rounded-2xl bg-rose-800 hover:bg-rose-700 active:bg-rose-900 text-sm font-extrabold text-white shadow-lg transition-transform active:scale-95 border border-rose-600/40 min-h-[48px] flex items-center justify-center"
          >
            Stand
          </button>

          <button
            type="button"
            disabled={!canDouble}
            onClick={() => handleDouble(activeHand.id)}
            className="py-3 sm:py-3.5 rounded-2xl bg-amber-600 hover:bg-amber-500 active:bg-amber-700 disabled:opacity-30 text-xs sm:text-sm font-extrabold text-white shadow-lg transition-transform active:scale-95 border border-amber-400/40 min-h-[48px] flex items-center justify-center"
          >
            Double (₹{activeHand.bet})
          </button>

          <button
            type="button"
            disabled={!canSplit}
            onClick={() => handleSplit(activeHand.id)}
            className="py-3 sm:py-3.5 rounded-2xl bg-blue-700 hover:bg-blue-600 active:bg-blue-800 disabled:opacity-30 text-xs sm:text-sm font-extrabold text-white shadow-lg transition-transform active:scale-95 border border-blue-500/40 min-h-[48px] flex items-center justify-center"
          >
            Split (₹{activeHand.bet})
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
