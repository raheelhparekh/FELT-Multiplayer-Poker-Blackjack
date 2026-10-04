import { motion } from "framer-motion";
import type React from "react";

export interface ChipViewProps {
  amount: number;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
  selected?: boolean;
  className?: string;
}

const CHIP_STYLES: Record<
  number,
  { bg: string; border: string; ring: string; text: string; edge: string }
> = {
  50: {
    bg: "from-blue-600 via-blue-700 to-blue-900",
    border: "border-blue-300",
    ring: "border-white/40",
    text: "text-white",
    edge: "bg-white",
  },
  100: {
    bg: "from-neutral-900 via-neutral-950 to-black",
    border: "border-amber-400",
    ring: "border-amber-400/50",
    text: "text-gold-300",
    edge: "bg-amber-400",
  },
  200: {
    bg: "from-emerald-600 via-emerald-700 to-emerald-900",
    border: "border-emerald-300",
    ring: "border-white/40",
    text: "text-white",
    edge: "bg-white",
  },
  500: {
    bg: "from-purple-700 via-purple-800 to-purple-950",
    border: "border-pink-300",
    ring: "border-pink-300/40",
    text: "text-pink-100",
    edge: "bg-pink-300",
  },
  1000: {
    bg: "from-amber-600 via-orange-600 to-red-800",
    border: "border-yellow-200",
    ring: "border-yellow-200/50",
    text: "text-yellow-100",
    edge: "bg-yellow-200",
  },
};

export const ChipView: React.FC<ChipViewProps> = ({
  amount,
  size = "md",
  onClick,
  selected = false,
  className = "",
}) => {
  const style = CHIP_STYLES[amount] ?? {
    bg: "from-zinc-700 to-zinc-900",
    border: "border-zinc-400",
    ring: "border-white/30",
    text: "text-white",
    edge: "bg-white",
  };

  const sizeClasses = {
    sm: "w-7 h-7 text-[10px] border",
    md: "w-11 h-11 sm:w-12 sm:h-12 text-xs border-2",
    lg: "w-14 h-14 sm:w-16 sm:h-16 text-sm border-2",
  }[size];

  return (
    <motion.button
      type="button"
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`relative rounded-full rounded-full shadow-lg flex items-center justify-center font-black select-none bg-gradient-to-br ${style.bg} ${style.border} ${style.text} ${sizeClasses} ${
        selected ? "ring-2 ring-gold-300 ring-offset-2 ring-offset-black scale-105" : ""
      } ${className}`}
    >
      {/* Dashed edge casino inserts */}
      <div className="absolute inset-0 rounded-full border-2 border-dashed border-white/25 pointer-events-none" />

      {/* Inner Inset Ring */}
      <div
        className={`w-3/4 h-3/4 rounded-full border ${style.ring} flex items-center justify-center shadow-inner bg-black/20`}
      >
        <span>{amount >= 1000 ? `${amount / 1000}k` : amount}</span>
      </div>
    </motion.button>
  );
};

/**
 * ChipStack: Renders a realistic staggered vertical chip stack for placed bets
 */
export const ChipStack: React.FC<{ totalBet: number; isSmall?: boolean }> = ({
  totalBet,
  isSmall = false,
}) => {
  if (totalBet <= 0) return null;

  // Decompose bet into chip denominations
  const denoms = [1000, 500, 200, 100, 50];
  const chips: number[] = [];
  let rem = totalBet;

  for (const d of denoms) {
    while (rem >= d && chips.length < 5) {
      chips.push(d);
      rem -= d;
    }
  }
  if (rem > 0 && chips.length < 5) {
    chips.push(50);
  }

  return (
    <div className="relative flex flex-col items-center select-none">
      {/* 3D Staggered Chip Layers */}
      <div className="relative flex flex-col items-center">
        {chips.map((val, idx) => (
          <div
            key={`stack-${idx}-${val}`}
            className="transition-transform"
            style={{
              marginTop: idx === 0 ? 0 : isSmall ? -22 : -28,
              zIndex: idx + 1,
            }}
          >
            <ChipView amount={val} size={isSmall ? "sm" : "sm"} />
          </div>
        ))}
      </div>

      {/* Numerical Total Tag */}
      <div className="mt-1 px-1.5 py-0.2 rounded-full bg-black/80 border border-gold-400/50 text-[10px] font-mono font-bold text-gold-300 shadow">
        ₹{totalBet.toLocaleString()}
      </div>
    </div>
  );
};
