import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Card, Pot, Street } from "@felt/shared";
import { CardView } from "../CardView";
import { ChipView } from "../ChipView";

interface PokerCommunityAreaProps {
  communityCards: Card[];
  pots: Pot[];
  street: Street | null;
  phase: string;
  tableStatusMessage: string | null;
}

export const PokerCommunityArea: React.FC<PokerCommunityAreaProps> = ({
  communityCards,
  pots,
  street,
  phase,
  tableStatusMessage,
}) => {
  const totalPot = pots.reduce((sum, p) => sum + p.amount, 0);

  // Pad to 5 slots so the table layout remains stable
  const emptySlotsCount = Math.max(0, 5 - communityCards.length);

  return (
    <div className="flex flex-col items-center justify-center space-y-3 z-10 select-none">
      {/* Street & Pot Header */}
      <div className="flex items-center gap-2 sm:gap-3 bg-black/60 backdrop-blur-md px-3 py-1 sm:px-4 sm:py-1.5 rounded-full border border-gold-400/40 shadow-xl">
        {street && (
          <span className="text-[10px] font-black tracking-widest uppercase text-gold-300 bg-gold-500/20 px-2 py-0.5 rounded-full border border-gold-400/30">
            {street}
          </span>
        )}
        <div className="flex items-center gap-1 sm:gap-1.5">
          <ChipView amount={totalPot > 0 ? totalPot : 100} size="xs" />
          <span className="text-[11px] sm:text-xs font-semibold text-emerald-300">Pot:</span>
          <span className="text-xs sm:text-sm font-black font-mono text-gold-300">
            ₹{totalPot.toLocaleString()}
          </span>
        </div>

        {/* Side pot indicator if more than 1 pot */}
        {pots.length > 1 && pots[0] && (
          <div className="flex items-center gap-1 pl-2 border-l border-emerald-800 text-[11px] text-emerald-400">
            <span>Main: ₹{pots[0].amount.toLocaleString()}</span>
            {pots.slice(1).map((sp, idx) => (
              <span key={`side-pot-${idx}`} className="text-gold-400/80">
                • Side {idx + 1}: ₹{sp.amount.toLocaleString()}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Community Cards Slots */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 p-1.5 sm:p-2 bg-emerald-950/40 border border-emerald-800/40 rounded-2xl shadow-inner min-h-[64px] sm:min-h-[96px]">
        <AnimatePresence>
          {communityCards.map((card, idx) => (
            <motion.div
              key={`community-${card.suit}-${card.rank}-${idx}`}
              initial={{ scale: 0.3, y: -45, opacity: 0, rotateY: 90 }}
              animate={{ scale: 1, y: 0, opacity: 1, rotateY: 0 }}
              transition={{
                type: "spring",
                stiffness: 260,
                damping: 20,
                delay: idx < 3 ? idx * 0.22 : 0.12,
              }}
              className="relative shadow-xl"
            >
              <CardView
                cardSlot={{ hidden: false, card }}
                isSmall={true}
                className="!w-10 !h-14 sm:!w-14 sm:!h-20 aspect-[5/7] text-[10px] sm:text-xs shrink-0"
              />
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Empty placeholder card slots */}
        {Array.from({ length: emptySlotsCount }).map((_, idx) => (
          <div
            key={`empty-slot-${idx}`}
            className="w-10 h-14 sm:w-14 sm:h-20 aspect-[5/7] rounded-md sm:rounded-lg border-2 border-dashed border-emerald-800/40 bg-black/20 flex items-center justify-center opacity-40 shrink-0"
          >
            <span className="text-emerald-700/60 font-serif text-xs sm:text-sm">♦</span>
          </div>
        ))}
      </div>

      {/* Status Message */}
      {tableStatusMessage && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[11px] sm:text-xs font-semibold text-emerald-300/90 tracking-wide text-center bg-black/40 px-3 py-1 rounded-full border border-emerald-800/40"
        >
          {tableStatusMessage}
        </motion.div>
      )}
    </div>
  );
};
