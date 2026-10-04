import type React from "react";
import { soundEngine } from "../audio/sound-engine";
import { ChipView } from "./ChipView";

interface ChipTrayProps {
  denominations: number[];
  selectedChip: number;
  onSelectChip: (amount: number) => void;
  onBetAdd: (amount: number) => void;
  onBetUndo: () => void;
  onBetClear: () => void;
  onBetRepeat: () => void;
  onBetLock: () => void;
  pendingBet: number;
  canLock: boolean;
  minBet: number;
  maxBet: number;
  disabled?: boolean;
}

export const ChipTray: React.FC<ChipTrayProps> = ({
  denominations,
  selectedChip,
  onSelectChip,
  onBetAdd,
  onBetUndo,
  onBetClear,
  onBetRepeat,
  onBetLock,
  pendingBet,
  canLock,
  minBet,
  maxBet,
  disabled = false,
}) => {
  const handleChipClick = (denom: number) => {
    soundEngine.play("chip_place");
    onSelectChip(denom);
    onBetAdd(denom);
  };

  const handleUndo = () => {
    soundEngine.play("chip_place");
    onBetUndo();
  };

  const handleClear = () => {
    soundEngine.play("chip_sweep");
    onBetClear();
  };

  const handleRepeat = () => {
    soundEngine.play("chip_stack");
    onBetRepeat();
  };

  const handleLock = () => {
    soundEngine.play("chip_stack");
    onBetLock();
  };

  return (
    <div className="w-full flex flex-col items-center gap-2.5 p-3 bg-black/80 backdrop-blur-md rounded-3xl border border-gold-400/40 shadow-2xl">
      {/* Bet Status Bar */}
      <div className="flex items-center justify-between w-full px-2 text-xs">
        <span className="text-emerald-400/80 font-mono">
          Min: ₹{minBet} / Max: ₹{maxBet}
        </span>
        <span className="font-bold text-sm text-gold-300 font-mono tracking-wide">
          Bet: ₹{pendingBet.toLocaleString()}
        </span>
      </div>

      {/* Chip Denomination Buttons */}
      <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
        {denominations.map((denom) => {
          const isSelected = selectedChip === denom;
          return (
            <ChipView
              key={denom}
              amount={denom}
              selected={isSelected}
              onClick={() => !disabled && handleChipClick(denom)}
              size="md"
            />
          );
        })}
      </div>

      {/* Action Controls */}
      <div className="flex items-center justify-center gap-2 w-full pt-1 flex-wrap text-xs">
        <button
          type="button"
          disabled={disabled || pendingBet === 0}
          onClick={handleUndo}
          className="px-3 py-1.5 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 active:scale-95 font-semibold text-zinc-300 border border-zinc-700 disabled:opacity-40 transition-all"
        >
          Undo
        </button>
        <button
          type="button"
          disabled={disabled || pendingBet === 0}
          onClick={handleClear}
          className="px-3 py-1.5 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 active:scale-95 font-semibold text-zinc-300 border border-zinc-700 disabled:opacity-40 transition-all"
        >
          Clear
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={handleRepeat}
          className="px-3 py-1.5 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 active:scale-95 font-semibold text-zinc-300 border border-zinc-700 disabled:opacity-40 transition-all"
        >
          Repeat
        </button>

        <button
          type="button"
          disabled={disabled || !canLock}
          onClick={handleLock}
          className="px-5 py-1.5 rounded-xl bg-gold-400 hover:bg-gold-300 active:scale-95 text-black font-extrabold shadow-md disabled:opacity-30 disabled:hover:bg-gold-400 transition-all"
        >
          Lock In Bet ✓
        </button>
      </div>
    </div>
  );
};
