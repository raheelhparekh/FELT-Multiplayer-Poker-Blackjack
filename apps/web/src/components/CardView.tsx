import type { ClientCard, Suit } from "@felt/shared";
import { motion } from "framer-motion";
import type React from "react";
import { useSettingsStore } from "../store/settings-store";

interface CardViewProps {
  cardSlot: ClientCard;
  isSmall?: boolean;
  className?: string;
  isRotated90?: boolean; // For Doubled down cards
  dealIndex?: number; // Staggered deal order
  isFlipping?: boolean; // 3D flip animation for hole card reveal
}

const SUIT_SYMBOLS: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

export const CardView: React.FC<CardViewProps> = ({
  cardSlot,
  isSmall = false,
  className = "",
  isRotated90 = false,
  dealIndex = 0,
  isFlipping = false,
}) => {
  const fourColorDeck = useSettingsStore((s) => s.fourColorDeck);
  const animationSpeed = useSettingsStore((s) => s.animationSpeed);

  // Compute suit color
  const getSuitColorClass = (suit: Suit) => {
    if (fourColorDeck) {
      switch (suit) {
        case "spades":
          return "text-zinc-950";
        case "hearts":
          return "text-red-600";
        case "diamonds":
          return "text-blue-600";
        case "clubs":
          return "text-emerald-700";
      }
    }

    return suit === "hearts" || suit === "diamonds" ? "text-red-600" : "text-zinc-950";
  };

  const animDuration = animationSpeed === 0 ? 0 : 0.38 / (animationSpeed || 1);
  const dealDelay = animationSpeed === 0 ? 0 : Math.min(0.8, dealIndex * 0.12);

  if (cardSlot.hidden) {
    // Face-down card with luxury patterned back
    return (
      <motion.div
        initial={
          animationSpeed > 0
            ? { scale: 0.6, opacity: 0, y: -80, x: 25, rotate: -15 }
            : false
        }
        animate={{
          scale: 1,
          opacity: 1,
          y: 0,
          x: 0,
          rotate: isRotated90 ? 90 : 0,
        }}
        transition={{
          type: "spring",
          stiffness: 260,
          damping: 22,
          mass: 0.8,
          delay: dealDelay,
          duration: animDuration,
        }}
        className={`relative rounded-lg border-2 border-amber-500/50 bg-gradient-to-br from-[#1a0a0f] via-[#2c1318] to-[#14080b] shadow-[0_8px_20px_rgba(0,0,0,0.6)] flex items-center justify-center select-none overflow-hidden ${
          isSmall ? "w-8 h-12" : "w-14 h-20 sm:w-16 sm:h-24"
        } ${className}`}
      >
        {/* Geometric Casino Diamond Pattern */}
        <div className="absolute inset-1 border border-gold-400/30 rounded flex items-center justify-center bg-[radial-gradient(#d4af37_1px,transparent_1px)] [background-size:6px_6px] opacity-75">
          <div className="w-5 h-7 border border-gold-400/60 rounded flex items-center justify-center bg-black/40">
            <span className="text-gold-300 font-serif text-xs">♠</span>
          </div>
        </div>
      </motion.div>
    );
  }

  const { rank, suit } = cardSlot.card;
  const symbol = SUIT_SYMBOLS[suit];
  const colorClass = getSuitColorClass(suit);

  return (
    <motion.div
      initial={
        animationSpeed > 0
          ? isFlipping
            ? { rotateY: 180, scale: 0.95, opacity: 0.8 }
            : { scale: 0.6, opacity: 0, y: -80, x: 25, rotate: -15 }
          : false
      }
      animate={{
        rotateY: 0,
        scale: 1,
        opacity: 1,
        y: 0,
        x: 0,
        rotate: isRotated90 ? 90 : 0,
      }}
      transition={{
        type: isFlipping ? "tween" : "spring",
        ease: "easeOut",
        stiffness: 260,
        damping: 22,
        mass: 0.8,
        delay: isFlipping ? 0 : dealDelay,
        duration: isFlipping ? 0.65 : animDuration,
      }}
      style={{ transformStyle: "preserve-3d" }}
      className={`relative rounded-lg bg-gradient-to-b from-white to-slate-100 border border-slate-300/90 shadow-[0_8px_20px_rgba(0,0,0,0.6)] flex flex-col justify-between p-1 select-none font-black ${
        isSmall ? "w-8 h-12 text-[10px]" : "w-14 h-20 sm:w-16 sm:h-24 text-xs sm:text-sm"
      } ${className}`}
    >
      {/* Top Left Index */}
      <div className={`leading-none flex flex-col items-center self-start ${colorClass}`}>
        <span className="tracking-tighter font-extrabold">{rank}</span>
        <span className="text-[10px] sm:text-xs -mt-0.5 leading-none">{symbol}</span>
      </div>

      {/* Center Large Watermark Suit */}
      <div
        className={`absolute inset-0 flex items-center justify-center pointer-events-none opacity-85 ${colorClass}`}
      >
        <span className={isSmall ? "text-sm" : "text-2xl sm:text-3xl"}>{symbol}</span>
      </div>

      {/* Bottom Right Index (Rotated) */}
      <div className={`leading-none flex flex-col items-center self-end rotate-180 ${colorClass}`}>
        <span className="tracking-tighter font-extrabold">{rank}</span>
        <span className="text-[10px] sm:text-xs -mt-0.5 leading-none">{symbol}</span>
      </div>
    </motion.div>
  );
};
