import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGameStore } from "../../store/game-store";
import { soundEngine } from "../../audio/sound-engine";

interface PokerActionBarProps {
  isMyTurn: boolean;
  legalActions: string[];
  toCall: number;
  currentBet: number;
  minRaise: number;
  heroStack: number;
  heroCommittedThisRound: number;
  potSize: number;
  bigBlind: number;
  onFold: () => void;
  onCheck: () => void;
  onCall: () => void;
  onBet: (amount: number) => void;
  onRaise: (to: number) => void;
  onAllIn: () => void;
}

export const PokerActionBar: React.FC<PokerActionBarProps> = ({
  isMyTurn,
  legalActions,
  toCall,
  currentBet,
  minRaise,
  heroStack,
  heroCommittedThisRound,
  potSize,
  bigBlind,
  onFold,
  onCheck,
  onCall,
  onBet,
  onRaise,
  onAllIn,
}) => {
  const maxCommitment = heroStack + heroCommittedThisRound;
  const canBet = legalActions.includes("bet");
  const canRaise = legalActions.includes("raise");
  const canCheck = legalActions.includes("check");
  const canCall = legalActions.includes("call");
  const canAllIn = legalActions.includes("allIn");

  // Determine initial bet / raise slider values
  const defaultMin = canRaise ? Math.min(maxCommitment, minRaise) : Math.min(heroStack, bigBlind);
  const [betAmount, setBetAmount] = useState<number>(defaultMin);

  // Pre-action selection when waiting for turn
  const [preAction, setPreAction] = useState<"checkFold" | "check" | "callAny" | null>(null);

  // Reset bet amount when it becomes hero's turn
  useEffect(() => {
    if (isMyTurn) {
      setBetAmount(defaultMin);
      // Auto-trigger pre-action if satisfied
      if (preAction === "checkFold") {
        if (canCheck) onCheck();
        else onFold();
      } else if (preAction === "check" && canCheck) {
        onCheck();
      } else if (preAction === "callAny" && canCall) {
        onCall();
      }
      setPreAction(null);
    }
  }, [isMyTurn]);

  // Quick preset calculation
  const setQuickBet = (fraction: number) => {
    if (canBet) {
      const target = Math.max(bigBlind, Math.round(potSize * fraction));
      setBetAmount(Math.min(heroStack, target));
    } else if (canRaise) {
      // Pot-sized raise in poker: 3 * currentBet + pot
      const potRaise = currentBet + potSize;
      const target = Math.round(potRaise * fraction);
      setBetAmount(Math.min(maxCommitment, Math.max(minRaise, target)));
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBetAmount(Number.parseInt(e.target.value, 10));
  };

  if (!isMyTurn) {
    // Pre-action bar when not hero's turn
    return (
      <div className="w-full max-w-xl mx-auto px-4 py-2 bg-black/60 backdrop-blur-md rounded-2xl border border-emerald-800/60 shadow-xl flex items-center justify-around text-xs select-none">
        <label className="flex items-center gap-2 cursor-pointer text-emerald-300 hover:text-white transition-colors">
          <input
            type="checkbox"
            checked={preAction === "checkFold"}
            onChange={() => setPreAction(preAction === "checkFold" ? null : "checkFold")}
            className="rounded border-emerald-700 text-gold-400 focus:ring-0"
          />
          <span>Check / Fold</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-emerald-300 hover:text-white transition-colors">
          <input
            type="checkbox"
            checked={preAction === "check"}
            onChange={() => setPreAction(preAction === "check" ? null : "check")}
            className="rounded border-emerald-700 text-gold-400 focus:ring-0"
          />
          <span>Check</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-emerald-300 hover:text-white transition-colors">
          <input
            type="checkbox"
            checked={preAction === "callAny"}
            onChange={() => setPreAction(preAction === "callAny" ? null : "callAny")}
            className="rounded border-emerald-700 text-gold-400 focus:ring-0"
          />
          <span>Call Any</span>
        </label>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="w-full max-w-2xl mx-auto px-2.5 py-2 sm:px-4 sm:py-3 bg-gradient-to-t from-black via-zinc-950/95 to-emerald-950/75 backdrop-blur-xl rounded-2xl sm:rounded-3xl border border-gold-400/50 shadow-[0_0_25px_rgba(0,0,0,0.8)] flex flex-col gap-1.5 sm:gap-2.5 z-30 select-none"
    >
      {/* Bet / Raise Slider & Quick Buttons */}
      {(canBet || canRaise) && (
        <div className="flex flex-col gap-1.5 sm:gap-2 bg-black/40 p-2 sm:p-2.5 rounded-xl sm:rounded-2xl border border-emerald-800/40">
          <div className="flex items-center justify-between text-xs font-bold text-emerald-300">
            <span>{canBet ? "Bet Sizing" : "Raise Sizing"}:</span>
            <span className="font-mono text-gold-300 text-xs sm:text-sm">₹{betAmount.toLocaleString()}</span>
          </div>

          {/* Quick Bet Preset Pills */}
          <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto py-0.5">
            <button
              type="button"
              onClick={() => setBetAmount(defaultMin)}
              className="flex-1 py-1 px-2 rounded-xl bg-emerald-900/60 hover:bg-emerald-800 text-[11px] font-bold text-emerald-200 border border-emerald-700/50 transition-colors"
            >
              Min
            </button>
            <button
              type="button"
              onClick={() => setQuickBet(0.5)}
              className="flex-1 py-1 px-2 rounded-xl bg-emerald-900/60 hover:bg-emerald-800 text-[11px] font-bold text-emerald-200 border border-emerald-700/50 transition-colors"
            >
              1/2 Pot
            </button>
            <button
              type="button"
              onClick={() => setQuickBet(0.75)}
              className="flex-1 py-1 px-2 rounded-xl bg-emerald-900/60 hover:bg-emerald-800 text-[11px] font-bold text-emerald-200 border border-emerald-700/50 transition-colors"
            >
              3/4 Pot
            </button>
            <button
              type="button"
              onClick={() => setQuickBet(1.0)}
              className="flex-1 py-1 px-2 rounded-xl bg-emerald-900/60 hover:bg-emerald-800 text-[11px] font-bold text-emerald-200 border border-emerald-700/50 transition-colors"
            >
              Pot
            </button>
            <button
              type="button"
              onClick={() => setBetAmount(canRaise ? maxCommitment : heroStack)}
              className="flex-1 py-1 px-2 rounded-xl bg-red-950/70 hover:bg-red-900 text-[11px] font-bold text-red-300 border border-red-700/50 transition-colors"
            >
              All-In
            </button>
          </div>

          {/* Sizing Range Slider */}
          <input
            type="range"
            min={defaultMin}
            max={canRaise ? maxCommitment : heroStack}
            step={bigBlind}
            value={betAmount}
            onChange={handleSliderChange}
            className="w-full accent-gold-400 cursor-pointer h-2 bg-emerald-950 rounded-lg appearance-none"
          />
        </div>
      )}

      {/* Primary Action Buttons */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {/* 1. Fold Button */}
        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => {
            soundEngine.play("card_flip");
            onFold();
          }}
          className="min-h-[42px] sm:min-h-[50px] rounded-xl sm:rounded-2xl bg-gradient-to-b from-red-700 via-red-800 to-red-950 hover:from-red-600 hover:to-red-900 text-white font-extrabold text-sm sm:text-base border border-red-500/60 shadow-[0_4px_15px_rgba(220,38,38,0.4)] flex flex-col items-center justify-center cursor-pointer transition-all"
        >
          <span>Fold</span>
          <span className="text-[10px] text-red-200/70 font-mono font-normal">F</span>
        </motion.button>

        {/* 2. Check / Call Button */}
        {canCheck ? (
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => {
              soundEngine.play("chip_place");
              onCheck();
            }}
            className="min-h-[42px] sm:min-h-[50px] rounded-xl sm:rounded-2xl bg-gradient-to-b from-emerald-600 via-emerald-700 to-emerald-900 hover:from-emerald-500 hover:to-emerald-800 text-white font-extrabold text-sm sm:text-base border border-emerald-400/60 shadow-[0_4px_15px_rgba(16,185,129,0.4)] flex flex-col items-center justify-center cursor-pointer transition-all"
          >
            <span>Check</span>
            <span className="text-[10px] text-emerald-200/70 font-mono font-normal">C</span>
          </motion.button>
        ) : (
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => {
              soundEngine.play("chip_place");
              onCall();
            }}
            className="min-h-[42px] sm:min-h-[50px] rounded-xl sm:rounded-2xl bg-gradient-to-b from-teal-600 via-teal-700 to-teal-900 hover:from-teal-500 hover:to-teal-800 text-white font-extrabold text-sm sm:text-base border border-teal-400/60 shadow-[0_4px_15px_rgba(20,184,166,0.4)] flex flex-col items-center justify-center cursor-pointer transition-all"
          >
            <span>Call ₹{toCall.toLocaleString()}</span>
            <span className="text-[10px] text-teal-200/70 font-mono font-normal">C</span>
          </motion.button>
        )}

        {/* 3. Bet / Raise / All-in Button */}
        {canBet ? (
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => {
              soundEngine.play("chip_place");
              onBet(betAmount);
            }}
            className="min-h-[42px] sm:min-h-[50px] rounded-xl sm:rounded-2xl bg-gradient-to-b from-gold-400 via-gold-500 to-amber-600 hover:from-gold-300 hover:to-amber-500 text-black font-extrabold text-sm sm:text-base border border-amber-300 shadow-[0_4px_20px_rgba(212,175,55,0.4)] flex flex-col items-center justify-center cursor-pointer transition-all"
          >
            <span>Bet ₹{betAmount.toLocaleString()}</span>
            <span className="text-[10px] text-zinc-900/80 font-mono font-normal">B</span>
          </motion.button>
        ) : canRaise ? (
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => {
              soundEngine.play("chip_place");
              onRaise(betAmount);
            }}
            className="min-h-[42px] sm:min-h-[50px] rounded-xl sm:rounded-2xl bg-gradient-to-b from-gold-400 via-gold-500 to-amber-600 hover:from-gold-300 hover:to-amber-500 text-black font-extrabold text-sm sm:text-base border border-amber-300 shadow-[0_4px_20px_rgba(212,175,55,0.4)] flex flex-col items-center justify-center cursor-pointer transition-all"
          >
            <span>Raise to ₹{betAmount.toLocaleString()}</span>
            <span className="text-[10px] text-zinc-900/80 font-mono font-normal">R</span>
          </motion.button>
        ) : canAllIn ? (
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => {
              soundEngine.play("chip_place");
              onAllIn();
            }}
            className="min-h-[42px] sm:min-h-[50px] rounded-xl sm:rounded-2xl bg-gradient-to-b from-red-600 via-rose-700 to-red-900 hover:from-red-500 hover:to-rose-800 text-white font-extrabold text-sm sm:text-base border border-rose-400 shadow-[0_4px_20px_rgba(244,63,94,0.4)] flex flex-col items-center justify-center cursor-pointer transition-all"
          >
            <span>All-In (₹{heroStack.toLocaleString()})</span>
            <span className="text-[10px] text-rose-200/80 font-mono font-normal">A</span>
          </motion.button>
        ) : null}
      </div>
    </motion.div>
  );
};
