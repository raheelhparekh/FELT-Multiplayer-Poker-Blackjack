import { AnimatePresence, motion } from "framer-motion";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { soundEngine } from "../audio/sound-engine";
import { useGameStore } from "../store/game-store";
import { useSettingsStore } from "../store/settings-store";

interface FloatingText {
  id: string;
  text: string;
  color: "win" | "loss" | "push" | "blackjack";
  x: number;
  y: number;
}

interface ChoreographerProps {
  showOutcomes?: boolean;
}

export const Choreographer: React.FC<ChoreographerProps> = ({ showOutcomes = true }) => {
  const currentView = useGameStore((s) => s.currentView);
  const myPlayerId = useGameStore((s) => s.myPlayerId);
  const animationSpeed = useSettingsStore((s) => s.animationSpeed);

  const prevPhaseRef = useRef<string | null>(null);
  const prevActiveHandRef = useRef<string | null>(null);
  const prevRoundRef = useRef<number>(0);

  const [celebration, setCelebration] = useState<"blackjack" | "win" | null>(null);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);

  useEffect(() => {
    if (!currentView) return;

    const { phase, activeHandId, roundNumber, hands } = currentView;
    const prevPhase = prevPhaseRef.current;
    const prevActiveHand = prevActiveHandRef.current;
    const prevRound = prevRoundRef.current;

    // Phase transition sounds
    if (prevPhase !== phase) {
      if (phase === "dealing") {
        soundEngine.play("card_deal");
      } else if (phase === "dealer_turn") {
        soundEngine.play("card_flip");
      } else if (phase === "round_summary" || phase === "settlement") {
        soundEngine.play("chip_sweep");
      }
      prevPhaseRef.current = phase;
    }

    // Turn indicator sound & haptics when it's MY turn
    if (activeHandId && activeHandId !== prevActiveHand) {
      const myActiveHand = hands.find((h) => h.id === activeHandId && h.playerId === myPlayerId);
      if (myActiveHand) {
        soundEngine.play("your_turn");
      }
      prevActiveHandRef.current = activeHandId;
    }

    // Round outcome celebration / floaters — ONLY when showOutcomes is true!
    if (showOutcomes && (phase === "round_summary" || phase === "settlement") && roundNumber !== prevRound) {
      prevRoundRef.current = roundNumber;

      const myHands = hands.filter((h) => h.playerId === myPlayerId);
      let hasBj = false;
      let hasWin = false;
      let hasBust = false;

      for (const h of myHands) {
        if (h.result === "blackjack") {
          hasBj = true;
          const payout = Math.floor(h.bet * 1.5);
          spawnFloatingText(`+${payout} (BJ!)`, "blackjack");
        } else if (h.result === "win") {
          hasWin = true;
          spawnFloatingText(`+${h.bet + h.doubleBet}`, "win");
        } else if (h.result === "bust") {
          hasBust = true;
          spawnFloatingText("BUST", "loss");
        } else if (h.result === "loss") {
          spawnFloatingText(`-${h.bet + h.doubleBet}`, "loss");
        } else if (h.result === "push") {
          spawnFloatingText("PUSH", "push");
        }
      }

      if (hasBj) {
        soundEngine.play("blackjack");
        setCelebration("blackjack");
        setTimeout(() => setCelebration(null), 3000);
      } else if (hasWin) {
        soundEngine.play("win_small");
        setCelebration("win");
        setTimeout(() => setCelebration(null), 2500);
      } else if (hasBust) {
        soundEngine.play("bust");
      }
    }
  }, [currentView, myPlayerId, showOutcomes]);

  const spawnFloatingText = (text: string, color: "win" | "loss" | "push" | "blackjack") => {
    const id = `float-${Date.now()}-${Math.random()}`;
    const x = window.innerWidth / 2 + (Math.random() * 80 - 40);
    const y = window.innerHeight * 0.65 + (Math.random() * 40 - 20);

    setFloatingTexts((prev) => [...prev, { id, text, color, x, y }]);

    setTimeout(() => {
      setFloatingTexts((prev) => prev.filter((item) => item.id !== id));
    }, 2200);
  };

  return (
    <div className="fixed inset-0 pointer-events-none z-40 overflow-hidden">
      {/* Floating Payout / Outcome Text */}
      <AnimatePresence>
        {floatingTexts.map((f) => {
          const colorClass =
            f.color === "blackjack"
              ? "text-gold-300 drop-shadow-[0_0_12px_rgba(240,208,96,0.9)]"
              : f.color === "win"
                ? "text-emerald-300 drop-shadow-[0_0_10px_rgba(52,211,153,0.8)]"
                : f.color === "loss"
                  ? "text-rose-400 drop-shadow-[0_0_10px_rgba(244,63,94,0.8)]"
                  : "text-blue-300 drop-shadow-[0_0_8px_rgba(147,197,253,0.8)]";

          return (
            <motion.div
              key={f.id}
              initial={{ opacity: 0, y: f.y + 15, scale: 0.8 }}
              animate={{ opacity: 1, y: f.y - 30, scale: 1.15 }}
              exit={{ opacity: 0, y: f.y - 60, scale: 0.9 }}
              transition={{ duration: animationSpeed === 0 ? 0 : 0.8 / (animationSpeed || 1) }}
              className={`absolute font-black text-lg sm:text-xl font-mono tracking-wider ${colorClass}`}
              style={{ left: f.x, transform: "translateX(-50%)" }}
            >
              {f.text}
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Blackjack / Big Win Sparkles & Fireworks */}
      <AnimatePresence>
        {celebration === "blackjack" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-gold-400/10 pointer-events-none backdrop-blur-xs"
          >
            {/* Golden Starburst Particles */}
            {Array.from({ length: 24 }).map((_, i) => {
              const angle = (i / 24) * 360;
              const dist = 120 + (i % 3) * 40;
              const rad = (angle * Math.PI) / 180;
              const tx = Math.cos(rad) * dist;
              const ty = Math.sin(rad) * dist;

              return (
                <motion.div
                  key={`star-${angle}`}
                  initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                  animate={{ x: tx, y: ty, scale: [0, 1.4, 0], opacity: [1, 0.9, 0] }}
                  transition={{ duration: 1.2, ease: "easeOut" }}
                  className="absolute w-3 h-3 rounded-full bg-gold-300 shadow-[0_0_12px_#f0d060]"
                />
              );
            })}

            <motion.div
              initial={{ scale: 0.4, opacity: 0, rotate: -5 }}
              animate={{ scale: [0.4, 1.2, 1], opacity: 1, rotate: 0 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center p-6 rounded-3xl bg-black/90 border-2 border-gold-400 shadow-[0_0_50px_rgba(212,175,55,0.8)]"
            >
              <span className="text-4xl">👑</span>
              <h2 className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-gold-300 via-white to-gold-400 uppercase tracking-widest mt-1">
                Blackjack!
              </h2>
              <p className="text-xs text-gold-300/80 font-bold tracking-wider mt-1">
                3 to 2 Natural Payout
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
