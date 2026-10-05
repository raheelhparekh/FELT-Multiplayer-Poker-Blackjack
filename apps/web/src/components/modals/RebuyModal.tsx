import type React from "react";
import { useState } from "react";
import { useGameStore } from "../../store/game-store";

export const RebuyModal: React.FC = () => {
  const activeModal = useGameStore((s) => s.activeModal);
  const closeModal = useGameStore((s) => s.closeModal);
  const currentView = useGameStore((s) => s.currentView);
  const myPlayerId = useGameStore((s) => s.myPlayerId);
  const rebuyRequest = useGameStore((s) => s.rebuyRequest);

  const [requested, setRequested] = useState(false);
  const [amount, setAmount] = useState<number>(currentView?.config.startingStack || 1000);

  if (activeModal !== "rebuy" || !currentView) {
    return null;
  }

  const stack = myPlayerId ? (currentView.stacks[myPlayerId] ?? 0) : 0;

  const handleRequest = () => {
    rebuyRequest(amount);
    setRequested(true);
    setTimeout(() => {
      closeModal();
      setRequested(false);
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm bg-[#0c1810] border border-amber-500/50 rounded-2xl p-6 shadow-2xl space-y-4 text-center">
        <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-2xl">
          💰
        </div>

        <div>
          <h2 className="text-lg font-bold text-white">Request More Chips</h2>
          <p className="text-xs text-emerald-400/80 mt-1">
            Current Stack: <span className="font-bold text-white font-mono">₹{stack.toLocaleString()}</span>
          </p>
        </div>

        <div className="space-y-2 text-left">
          <label className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider block">
            Select Amount
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {[500, 1000, 2500, 5000].map((preset) => (
              <button
                type="button"
                key={preset}
                onClick={() => setAmount(preset)}
                className={`py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                  amount === preset
                    ? "bg-gold-400 text-black shadow-sm"
                    : "bg-emerald-950/80 border border-emerald-800/40 text-emerald-200 hover:bg-emerald-900/40"
                }`}
              >
                ₹{preset.toLocaleString()}
              </button>
            ))}
          </div>
          <input
            type="number"
            min={100}
            max={100000}
            step={100}
            value={amount}
            onChange={(e) => setAmount(Math.max(100, Number.parseInt(e.target.value, 10) || 100))}
            className="w-full bg-black/50 border border-emerald-700/60 focus:border-gold-400 rounded-xl px-3.5 py-2 text-sm font-mono font-semibold text-white placeholder-emerald-600 focus:outline-none transition-colors"
            placeholder="Custom amount"
          />
        </div>

        <div className="bg-emerald-950/60 border border-emerald-900/60 rounded-xl p-3 text-xs text-emerald-300">
          Dealer and table host will receive a popup notification to approve your chip request.
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={closeModal}
            className="flex-1 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-xs transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={requested}
            onClick={handleRequest}
            className="flex-1 py-2.5 rounded-xl bg-gold-400 hover:bg-gold-300 disabled:bg-emerald-600 text-black font-bold text-xs shadow-lg transition-transform active:scale-95"
          >
            {requested ? "Requested! ✓" : `Request ₹${amount.toLocaleString()}`}
          </button>
        </div>
      </div>
    </div>
  );
};
