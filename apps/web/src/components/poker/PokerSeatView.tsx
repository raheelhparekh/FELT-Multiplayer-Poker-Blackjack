import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import type { ClientPokerPlayerView, SeatNumber } from "@felt/shared";
import { CardView } from "../CardView";
import { ChipView } from "../ChipView";
import { AVATAR_OPTIONS } from "../../types/avatars";

export type ChipDirection = "top" | "bottom" | "left" | "right";

interface PokerSeatViewProps {
  seatNumber: SeatNumber;
  player: ClientPokerPlayerView | null;
  isMe: boolean;
  isDealerButton: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  canSit: boolean;
  isSwitchingSeat?: boolean;
  actionDeadline: number | null;
  actionTimerSec?: number | null;
  isPaused?: boolean;
  onSit: () => void;
  className?: string;
  dealOrder?: number;
  totalSeated?: number;
  handNumber?: number;
  chipPosition?: ChipDirection;
}

export const PokerSeatView: React.FC<PokerSeatViewProps> = ({
  seatNumber,
  player,
  isMe,
  isDealerButton,
  isSmallBlind,
  isBigBlind,
  canSit,
  isSwitchingSeat = false,
  actionDeadline,
  actionTimerSec = 30,
  isPaused = false,
  onSit,
  className = "",
  dealOrder = 0,
  totalSeated = 6,
  handNumber = 1,
  chipPosition = "bottom",
}) => {
  const [timerPercent, setTimerPercent] = useState<number>(100);

  const isTurn = player?.isTurn ?? false;

  // Turn timer countdown bar (freezes when paused)
  useEffect(() => {
    if (!isTurn || !actionDeadline || isPaused) {
      if (!isTurn) setTimerPercent(100);
      return;
    }

    const totalDuration = (actionTimerSec ?? 30) * 1000;
    const update = () => {
      const remaining = Math.max(0, actionDeadline - Date.now());
      const pct = Math.min(100, Math.max(0, (remaining / totalDuration) * 100));
      setTimerPercent(pct);
    };

    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [isTurn, actionDeadline, actionTimerSec, isPaused]);

  // Directional chip classes ensuring bet chips float inwards toward table center / pot
  const getChipPosClass = (dir: ChipDirection, hasCards = false) => {
    switch (dir) {
      case "top":
        return hasCards
          ? "-top-6 sm:-top-7 left-1/2 -translate-x-1/2"
          : "-top-5 sm:-top-6 left-1/2 -translate-x-1/2";
      case "bottom":
        return "-bottom-5 sm:-bottom-6 left-1/2 -translate-x-1/2";
      case "left":
        return "top-1/2 -left-8 sm:-left-10 -translate-y-1/2";
      case "right":
        return "top-1/2 -right-8 sm:-right-10 -translate-y-1/2";
    }
  };

  // ─── 1. Empty Seat View (Compact Corner Button) ───────────────────────────
  if (!player) {
    return (
      <div className={`flex flex-col items-center justify-center p-1 transition-all ${className}`}>
        {canSit ? (
          <motion.button
            type="button"
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.94 }}
            onClick={onSit}
            title={isSwitchingSeat ? `Switch to Seat #${seatNumber}` : `Sit at Seat #${seatNumber}`}
            className="w-8 h-8 sm:w-11 sm:h-11 rounded-full border-2 border-dashed border-emerald-500/50 hover:border-gold-400 bg-black/50 hover:bg-gold-500/10 flex flex-col items-center justify-center text-emerald-400 hover:text-gold-300 transition-colors shadow-lg cursor-pointer"
          >
            <span className="text-xs sm:text-sm font-bold leading-none">
              {isSwitchingSeat ? "⇄" : "+"}
            </span>
            <span className="text-[7px] sm:text-[8px] font-bold uppercase tracking-wider">#{seatNumber}</span>
          </motion.button>
        ) : (
          <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-full border border-dashed border-emerald-900/40 bg-black/20 flex items-center justify-center text-emerald-800 text-[8px] uppercase font-bold">
            #{seatNumber}
          </div>
        )}
      </div>
    );
  }

  const avatar = AVATAR_OPTIONS.find((a) => a.id === player.avatarId);
  const isWaiting = Boolean(player.isWaiting || player.isSittingOut || (player.hasFolded && player.cards.length === 0));
  const isFoldedInHand = player.hasFolded && player.cards.length > 0;

  // ─── 2. HERO VIEW (Viewing Player - Large, Clear & Prominent) ──────────────
  if (isMe) {
    return (
      <div
        className={`relative flex flex-col items-center justify-center transition-all z-20 ${
          isFoldedInHand ? "opacity-40 grayscale-[50%]" : isWaiting ? "opacity-80" : "opacity-100"
        } ${className}`}
      >
        {/* Dealer / Blind Badges */}
        <div className="absolute -top-3.5 flex items-center gap-1 z-30">
          {isDealerButton && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="w-5 h-5 rounded-full bg-white text-zinc-950 font-black text-[10px] flex items-center justify-center shadow-lg border border-zinc-400 ring-1 ring-black"
            >
              D
            </motion.div>
          )}
          {isSmallBlind && (
            <div className="px-1.5 py-0.5 rounded-full bg-blue-600 text-white font-bold text-[9px] shadow border border-blue-400">
              SB
            </div>
          )}
          {isBigBlind && (
            <div className="px-1.5 py-0.5 rounded-full bg-amber-600 text-white font-bold text-[9px] shadow border border-yellow-300">
              BB
            </div>
          )}
        </div>

        {/* Committed Bet Floating Badge (floats inwards towards table center) */}
        {player.committedThisRound > 0 && (
          <motion.div
            initial={{ scale: 0.5, y: 10, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            className={`absolute ${getChipPosClass(chipPosition, true)} flex items-center gap-1 bg-black/90 px-1.5 py-0.5 rounded-full border border-gold-400/60 shadow-md z-30 backdrop-blur-md whitespace-nowrap`}
          >
            <ChipView amount={player.committedThisRound} size="xs" />
            <span className="text-[9px] sm:text-[10px] font-mono font-bold text-gold-300">
              ₹{player.committedThisRound.toLocaleString()}
            </span>
          </motion.div>
        )}

        {/* Hand Strength Label Hint for Hero */}
        {player.handStrengthName && !isFoldedInHand && !isWaiting && (
          <motion.div
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[10px] sm:text-xs font-bold text-gold-300 bg-black/85 px-3 py-0.5 rounded-full border border-gold-400/60 mb-1 z-20 shadow-lg backdrop-blur-md"
          >
            {player.handStrengthName}
          </motion.div>
        )}

        {/* Hero Hole Cards (Always dealt face-up to owner) */}
        {player.cards.length > 0 && (
          <div className="relative flex flex-col items-center mb-1 z-10">
            <div className="flex items-center -space-x-4 sm:-space-x-5">
              {player.cards.map((c, idx) => {
                const dealDelay = dealOrder * 0.12 + idx * (totalSeated * 0.12);

                return (
                  <motion.div
                    key={`hero-card-${idx}-${handNumber}`}
                    initial={{
                      opacity: 0,
                      scale: 0.3,
                      y: -70,
                      x: idx === 0 ? -15 : 15,
                      rotate: idx === 0 ? -12 : 12,
                    }}
                    animate={{
                      opacity: 1,
                      scale: 1,
                      y: 0,
                      x: 0,
                      rotate: idx === 0 ? -4 : 4,
                    }}
                    transition={{
                      type: "spring",
                      stiffness: 260,
                      damping: 22,
                      delay: Math.min(1.2, dealDelay),
                    }}
                    whileHover={{ y: -8, scale: 1.08 }}
                    className="transition-transform relative"
                  >
                    <CardView
                      cardSlot={c}
                      isSmall={false}
                      className="shadow-2xl"
                    />
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* Hero Avatar & Stack Pill */}
        <div
          className={`relative flex items-center gap-2 p-1.5 sm:p-2 rounded-2xl border backdrop-blur-md transition-all shadow-xl ${
            isTurn
              ? "bg-emerald-950/95 border-gold-400 ring-2 ring-gold-400/80 shadow-[0_0_20px_rgba(212,175,55,0.4)]"
              : "bg-emerald-900/80 border-emerald-500/60 ring-1 ring-emerald-400/30"
          }`}
        >
          <div className="relative">
            <div
              className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full overflow-hidden border-2 flex items-center justify-center text-lg ${
                isTurn ? "border-gold-400 bg-gold-500/20" : "border-emerald-600 bg-black/40"
              }`}
            >
              {avatar?.emoji ?? "👤"}
            </div>
            {player.isAllIn && (
              <span className="absolute -bottom-1 -right-1 text-[8px] font-black uppercase tracking-tight bg-red-600 text-white px-1 rounded border border-red-400 shadow">
                ALL-IN
              </span>
            )}
            {(isFoldedInHand || isWaiting) && (
              <span className="absolute -bottom-1 -right-1 text-[8px] font-black uppercase tracking-tight bg-zinc-700 text-zinc-200 px-1 rounded border border-zinc-500 shadow">
                {player.isSittingOut ? "SIT OUT" : isWaiting ? "NEXT HAND" : "FOLD"}
              </span>
            )}
          </div>

          <div className="flex flex-col min-w-[75px] sm:min-w-[90px]">
            <div className="flex items-center gap-1">
              <span className="text-xs font-bold text-white truncate max-w-[80px]">
                {player.displayName}
              </span>
              <span className="text-[9px] font-black text-gold-400">(You)</span>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-400">
              ₹{player.stack.toLocaleString()}
            </span>
          </div>

          {/* Turn Countdown Line */}
          {isTurn && (
            <div className="absolute -bottom-1 left-2 right-2 h-1 bg-black/60 rounded-full overflow-hidden border border-gold-400/30">
              <motion.div
                className="h-full bg-gradient-to-r from-gold-400 to-amber-300"
                style={{ width: `${timerPercent}%` }}
                transition={{ duration: 0.1 }}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── 3. OPPONENT VIEW (Compact Micro-Pod along Corners & Edges) ───────────
  return (
    <div
      className={`relative flex flex-col items-center justify-center transition-all ${
        isFoldedInHand ? "opacity-35 grayscale-[60%]" : isWaiting ? "opacity-75" : "opacity-100"
      } ${className}`}
    >
      {/* Dealer & Blind Tags */}
      <div className="absolute -top-3 flex items-center gap-0.5 z-20">
        {isDealerButton && (
          <div className="w-4 h-4 rounded-full bg-white text-zinc-950 font-black text-[9px] flex items-center justify-center shadow border border-zinc-400">
            D
          </div>
        )}
        {isSmallBlind && (
          <div className="px-1 rounded bg-blue-600 text-white font-bold text-[8px] shadow">
            SB
          </div>
        )}
        {isBigBlind && (
          <div className="px-1 rounded bg-amber-600 text-white font-bold text-[8px] shadow">
            BB
          </div>
        )}
      </div>

      {/* Committed Bet Floating Badge (Inward float toward center) */}
      {player.committedThisRound > 0 && (
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={`absolute ${getChipPosClass(chipPosition, player.cards.length > 0)} flex items-center gap-0.5 bg-black/90 px-1 py-0.5 rounded-full border border-gold-400/50 shadow-md z-30 backdrop-blur-sm whitespace-nowrap`}
        >
          <ChipView amount={player.committedThisRound} size="xs" />
          <span className="text-[8px] sm:text-[9px] font-mono font-bold text-gold-300">
            ₹{player.committedThisRound.toLocaleString()}
          </span>
        </motion.div>
      )}

      {/* Opponent Micro Hole Cards (Ultra-compact stacked cards) */}
      {player.cards.length > 0 && (
        <div className="relative flex items-center -space-x-2.5 mb-0.5 z-10">
          {player.cards.map((c, idx) => (
            <motion.div
              key={`opp-card-${player.id}-${idx}-${handNumber}`}
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1, rotate: idx === 0 ? -6 : 6 }}
              className="shadow-md"
            >
              <CardView cardSlot={c} isMicro={true} />
            </motion.div>
          ))}
        </div>
      )}

      {/* Opponent Micro Avatar & Info Pill */}
      <div
        className={`relative flex items-center gap-1.5 p-1 rounded-xl border backdrop-blur-md transition-all shadow-md ${
          isTurn
            ? "bg-emerald-950/90 border-gold-400 ring-2 ring-gold-400 shadow-[0_0_12px_rgba(212,175,55,0.4)]"
            : "bg-black/75 border-emerald-900/60"
        }`}
      >
        {/* Micro Avatar Icon */}
        <div
          className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full overflow-hidden border flex items-center justify-center text-xs shrink-0 ${
            isTurn ? "border-gold-400 bg-gold-500/20" : "border-emerald-700 bg-black/40"
          }`}
        >
          {avatar?.emoji ?? "👤"}
        </div>

        {/* Micro Name & Stack */}
        <div className="flex flex-col min-w-[48px] sm:min-w-[56px] max-w-[62px] sm:max-w-[72px]">
          <span className="text-[9px] sm:text-[10px] font-bold text-zinc-200 truncate leading-tight">
            {player.displayName}
          </span>
          <span className="text-[9px] sm:text-[10px] font-mono font-bold text-emerald-400 leading-tight">
            ₹{player.stack.toLocaleString()}
          </span>
        </div>

        {/* All-in / Folded Mini Pill */}
        {player.isAllIn && (
          <span className="absolute -bottom-1 -right-1 text-[7px] font-black uppercase bg-red-600 text-white px-0.5 rounded shadow">
            ALL
          </span>
        )}
        {(isFoldedInHand || isWaiting) && (
          <span className="absolute -bottom-1 -right-1 text-[7px] font-black uppercase bg-zinc-700 text-zinc-200 px-0.5 rounded shadow">
            {player.isSittingOut ? "SIT" : isWaiting ? "WAIT" : "FOLD"}
          </span>
        )}

        {/* Turn Countdown Line */}
        {isTurn && (
          <div className="absolute -bottom-0.5 left-1 right-1 h-0.5 bg-black/60 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-gold-400 to-amber-300"
              style={{ width: `${timerPercent}%` }}
              transition={{ duration: 0.1 }}
            />
          </div>
        )}
      </div>
    </div>
  );
};
