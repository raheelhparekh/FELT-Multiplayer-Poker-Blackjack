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

  if (activeModal !== "rebuy" || !currentView) {
    return null;
  }

  const stack = myPlayerId ? (currentView.stacks[myPlayerId] ?? 0) : 0;
  const startingStack = currentView.config.startingStack;

  const handleRequest = () => {
    rebuyRequest();
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
          <h2 className="text-lg font-bold text-white">Chip Rebuy Request</h2>
          <p className="text-xs text-emerald-400/80 mt-1">
            Current Stack: <span className="font-bold text-white font-mono">{stack}</span>
          </p>
        </div>

        <div className="bg-emerald-950/60 border border-emerald-900/60 rounded-xl p-3 text-xs text-emerald-300">
          Requesting a rebuy will notify the table host to grant you{" "}
          <strong className="text-gold-300 font-mono">+{startingStack}</strong> chips.
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
            {requested ? "Requested! ✓" : "Request Rebuy"}
          </button>
        </div>
      </div>
    </div>
  );
};
