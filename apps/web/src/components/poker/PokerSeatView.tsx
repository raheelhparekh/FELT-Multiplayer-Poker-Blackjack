import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ClientPokerPlayerView, SeatNumber } from "@felt/shared";
import { soundEngine } from "../../audio/sound-engine";
import { CardView } from "../CardView";
import { ChipView } from "../ChipView";
import { AVATAR_OPTIONS } from "../../types/avatars";
import { useGameStore } from "../../store/game-store";

interface PokerSeatViewProps {
  seatNumber: SeatNumber;
  player: ClientPokerPlayerView | null;
  isMe: boolean;
  isDealerButton: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  canSit: boolean;
  actionDeadline: number | null;
  onSit: () => void;
  className?: string;
  dealOrder?: number;
  totalSeated?: number;
  handNumber?: number;
}

export const PokerSeatView: React.FC<PokerSeatViewProps> = ({
  seatNumber,
  player,
  isMe,
  isDealerButton,
  isSmallBlind,
  isBigBlind,
  canSit,
  actionDeadline,
  onSit,
  className = "",
  dealOrder = 0,
  totalSeated = 6,
  handNumber = 1,
}) => {
  // Blind Play state for Hero: option to play blind like in real casino / Teen Patti
  const [hasSeenCards, setHasSeenCards] = useState<boolean>(false);
  const [isScreenShielded, setIsScreenShielded] = useState<boolean>(false);
  const prevHandRef = useRef(handNumber);

  const [timerPercent, setTimerPercent] = useState<number>(100);

  const isTurn = player?.isTurn ?? false;

  // Reset seen state when a new hand is dealt
  useEffect(() => {
    if (handNumber !== prevHandRef.current) {
      prevHandRef.current = handNumber;
      setHasSeenCards(false);
      setIsScreenShielded(false);
    }
  }, [handNumber]);

  // Turn timer countdown bar
  useEffect(() => {
    if (!isTurn || !actionDeadline) {
      setTimerPercent(100);
      return;
    }

    const totalDuration = 30000; // standard 30s
    const update = () => {
      const remaining = Math.max(0, actionDeadline - Date.now());
      const pct = Math.min(100, Math.max(0, (remaining / totalDuration) * 100));
      setTimerPercent(pct);
    };

    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [isTurn, actionDeadline]);

  if (!player) {
    return (
      <div
        className={`flex flex-col items-center justify-center p-2 rounded-2xl transition-all ${className}`}
      >
        {canSit ? (
          <motion.button
            type="button"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onSit}
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-dashed border-emerald-600/50 hover:border-gold-400 bg-black/40 hover:bg-gold-500/10 flex flex-col items-center justify-center gap-0.5 text-emerald-400 hover:text-gold-300 transition-colors shadow-lg cursor-pointer"
          >
            <span className="text-xl sm:text-2xl font-bold">+</span>
            <span className="text-[10px] font-bold uppercase tracking-wider">Seat {seatNumber}</span>
          </motion.button>
        ) : (
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full border border-dashed border-emerald-900/40 bg-black/20 flex items-center justify-center text-emerald-800 text-[10px] uppercase font-bold">
            #{seatNumber}
          </div>
        )}
      </div>
    );
  }

  const avatar = AVATAR_OPTIONS.find((a) => a.id === player.avatarId);
  const isFolded = player.hasFolded;

  const handleSeeCards = () => {
    soundEngine.play("card_flip");
    setHasSeenCards(true);
    setIsScreenShielded(false);
    if (isMe) {
      useGameStore.getState().pokerSeeCards();
    }
  };

  const handleToggleScreenShield = () => {
    soundEngine.play("card_flip");
    setIsScreenShielded((prev) => !prev);
  };

  // Determine if player has seen cards:
  // Authoritative player.hasSeenCards from server synchronizes across all table participants
  const hasPlayerSeenCards = Boolean(player.hasSeenCards || (isMe && hasSeenCards));
  const isPlayerBlind = player.cards.length > 0 && !hasPlayerSeenCards;

  return (
    <div
      className={`relative flex flex-col items-center justify-center transition-all ${
        isFolded ? "opacity-40 grayscale-[50%]" : "opacity-100"
      } ${className}`}
    >
      {/* Dealer & Blind Badges */}
      <div className="absolute -top-3.5 flex items-center gap-1 z-20">
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

        {/* Casino Blind / Seen Status Badge */}
        {!isFolded && player.cards.length > 0 && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shadow-md border ${
              isPlayerBlind
                ? "bg-amber-500/25 text-amber-300 border-amber-500/50 animate-pulse"
                : "bg-emerald-500/25 text-emerald-300 border-emerald-500/40"
            }`}
          >
            <span>{isPlayerBlind ? "👁️‍🗨️" : "👁️"}</span>
            <span>{isPlayerBlind ? "BLIND" : "SEEN"}</span>
          </motion.div>
        )}
      </div>

      {/* Committed Bet Floating Badge */}
      {player.committedThisRound > 0 && (
        <motion.div
          initial={{ scale: 0.5, y: 10, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          className="absolute -bottom-7 flex items-center gap-1 bg-black/85 px-2 py-0.5 rounded-full border border-gold-400/50 shadow-xl z-20 backdrop-blur-sm"
        >
          <ChipView amount={player.committedThisRound} size="sm" />
          <span className="text-[11px] font-mono font-bold text-gold-300">
            ₹{player.committedThisRound.toLocaleString()}
          </span>
          {isPlayerBlind && (
            <span className="text-[8px] font-black text-amber-400 bg-amber-950/80 px-1 rounded uppercase">
              Blind
            </span>
          )}
        </motion.div>
      )}

      {/* Hole Cards Container with Sequential Dealing and Blind Options */}
      {player.cards.length > 0 && (
        <div className="relative flex flex-col items-center mb-1 z-10">
          <div className="flex items-center -space-x-4">
            {player.cards.map((c, idx) => {
              // Hero cards are hidden if playing blind or shielded; other players are hidden per server client card
              const isCardHidden = isMe ? (!hasPlayerSeenCards || isScreenShielded) : c.hidden;
              // Staggered dealing timing: card 0 round 1, card 1 round 2
              const dealDelay = dealOrder * 0.12 + idx * (totalSeated * 0.12);

              return (
                <motion.div
                  key={`seat-${seatNumber}-card-${idx}-${handNumber}`}
                  initial={{
                    opacity: 0,
                    scale: 0.3,
                    y: -90,
                    x: idx === 0 ? -15 : 15,
                    rotate: idx === 0 ? -14 : 14,
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
                  whileHover={isMe && hasPlayerSeenCards && !isScreenShielded ? { y: -8, scale: 1.08 } : {}}
                  className="transition-transform cursor-pointer relative"
                  onClick={isMe && !hasPlayerSeenCards ? handleSeeCards : undefined}
                >
                  <CardView
                    cardSlot={isCardHidden ? { hidden: true } : c}
                    isSmall={!isMe}
                    className="shadow-2xl"
                  />
                </motion.div>
              );
            })}
          </div>

          {/* Hero "See Cards" Casino Action Button when playing Blind */}
          {isMe && !isFolded && (
            <div className="mt-1 flex items-center gap-1.5 z-30">
              {!hasPlayerSeenCards ? (
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.94 }}
                  onClick={handleSeeCards}
                  className="px-2.5 py-1 rounded-full bg-gradient-to-r from-gold-500 to-amber-400 hover:from-gold-400 hover:to-amber-300 text-black font-black text-[10px] tracking-wide shadow-lg border border-gold-300 flex items-center gap-1 animate-bounce cursor-pointer"
                  title="Click to peek at your hole cards"
                >
                  <span>👁️</span>
                  <span>See Cards</span>
                </motion.button>
              ) : (
                <button
                  type="button"
                  onClick={handleToggleScreenShield}
                  className="text-[9px] text-emerald-400/80 hover:text-gold-300 font-mono tracking-wider bg-black/60 px-2 py-0.5 rounded-full border border-emerald-800/60 transition-colors cursor-pointer"
                  title="Shield card display on your screen from spectators"
                >
                  {isScreenShielded ? "Peek Cards 👁️" : "Shield Screen 🙈"}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Hand Strength Label Hint for Hero (only visible when seen) */}
      {isMe && player.handStrengthName && !isFolded && hasPlayerSeenCards && !isScreenShielded && (
        <motion.div
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[10px] font-bold text-gold-300 bg-black/80 px-2.5 py-0.5 rounded-full border border-gold-400/50 mb-1 z-20 shadow-md backdrop-blur-sm"
        >
          {player.handStrengthName}
        </motion.div>
      )}

      {/* Player Avatar & Info Pill */}
      <div
        className={`relative flex items-center gap-2 p-1.5 sm:p-2 rounded-2xl border backdrop-blur-md transition-all shadow-xl ${
          isTurn
            ? "bg-emerald-950/90 border-gold-400 ring-2 ring-gold-400/80 shadow-[0_0_20px_rgba(212,175,55,0.4)]"
            : isMe
              ? "bg-emerald-900/70 border-emerald-500/60 ring-1 ring-emerald-400/30"
              : "bg-black/70 border-emerald-800/50"
        }`}
      >
        {/* Avatar Image */}
        <div className="relative">
          <div
            className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full overflow-hidden border-2 flex items-center justify-center text-lg ${
              isTurn ? "border-gold-400 bg-gold-500/20" : "border-emerald-600 bg-black/40"
            }`}
          >
            {avatar?.emoji ?? "👤"}
          </div>

          {/* All-in Badge */}
          {player.isAllIn && (
            <span className="absolute -bottom-1 -right-1 text-[8px] font-black uppercase tracking-tight bg-red-600 text-white px-1 rounded border border-red-400 shadow">
              ALL-IN
            </span>
          )}

          {/* Folded Badge */}
          {player.hasFolded && (
            <span className="absolute -bottom-1 -right-1 text-[8px] font-black uppercase tracking-tight bg-zinc-700 text-zinc-300 px-1 rounded border border-zinc-500 shadow">
              FOLD
            </span>
          )}
        </div>

        {/* Name and Stack */}
        <div className="flex flex-col min-w-[70px] sm:min-w-[85px]">
          <div className="flex items-center gap-1">
            <span className="text-xs font-bold text-white truncate max-w-[75px] sm:max-w-[90px]">
              {player.displayName}
            </span>
            {isMe && <span className="text-[9px] font-extrabold text-gold-400">(You)</span>}
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
};
