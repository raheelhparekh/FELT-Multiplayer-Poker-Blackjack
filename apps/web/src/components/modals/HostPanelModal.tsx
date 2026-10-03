import type React from "react";
import { useState } from "react";
import { useGameStore } from "../../store/game-store";

export const HostPanelModal: React.FC = () => {
  const activeModal = useGameStore((s) => s.activeModal);
  const closeModal = useGameStore((s) => s.closeModal);
  const currentView = useGameStore((s) => s.currentView);
  const myPlayerId = useGameStore((s) => s.myPlayerId);
  const setDealer = useGameStore((s) => s.setDealer);
  const assignSeat = useGameStore((s) => s.assignSeat);
  const kick = useGameStore((s) => s.kick);
  const transferHost = useGameStore((s) => s.transferHost);
  const adjustChips = useGameStore((s) => s.adjustChips);
  const updateConfig = useGameStore((s) => s.updateConfig);
  const pause = useGameStore((s) => s.pause);
  const resume = useGameStore((s) => s.resume);
  const endSession = useGameStore((s) => s.endSession);
  const hostApproveRebuy = useGameStore((s) => s.hostApproveRebuy);

  // Chip adjustment local state
  const [selectedTarget, setSelectedTarget] = useState<string>("");
  const [adjustOp, setAdjustOp] = useState<"set" | "add" | "subtract">("add");
  const [adjustAmount, setAdjustAmount] = useState<number>(500);

  if (activeModal !== "host" || !currentView || currentView.hostId !== myPlayerId) {
    return null;
  }

  const { participants, stacks, config, dealerId, isPaused } = currentView;

  const handleAdjustSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTarget || adjustAmount <= 0) return;
    adjustChips(selectedTarget, adjustOp, adjustAmount);
  };

  const lowStackPlayers = participants.filter((p) => {
    const stack = stacks[p.id] ?? 0;
    return stack < config.minBet;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg max-h-[90vh] bg-[#0c1810] border border-amber-500/40 rounded-2xl flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-emerald-900/50 bg-black/40">
          <div className="flex items-center gap-2">
            <span className="text-amber-400 font-bold">⚙</span>
            <h2 className="text-base font-bold text-white tracking-wide">Host Control Center</h2>
          </div>
          <button
            type="button"
            onClick={closeModal}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-emerald-400 hover:text-white hover:bg-emerald-900/50 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 text-xs text-emerald-200">
          {/* Pause / Resume / End Flow */}
          <div className="bg-emerald-950/40 border border-emerald-900/60 rounded-xl p-3.5 space-y-2.5">
            <h3 className="font-bold uppercase text-[11px] tracking-wider text-amber-300">
              Session Controls
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {isPaused ? (
                <button
                  type="button"
                  onClick={() => resume()}
                  className="py-2.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all shadow"
                >
                  ▶ Resume Game
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => pause()}
                  className="py-2.5 px-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold transition-all shadow"
                >
                  ⏸ Pause Game
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Are you sure you want to end this game session?")) {
                    endSession();
                    closeModal();
                  }
                }}
                className="py-2.5 px-3 rounded-lg bg-rose-900/80 hover:bg-rose-800 text-rose-200 border border-rose-700/60 font-bold transition-all"
              >
                ⏹ End Session
              </button>
            </div>
          </div>

          {/* Low Chip Players / Quick Rebuy Approval */}
          {lowStackPlayers.length > 0 && (
            <div className="bg-amber-950/40 border border-amber-500/50 rounded-xl p-3.5 space-y-2">
              <h3 className="font-bold text-amber-300 uppercase text-[11px] tracking-wider">
                Low Chips / Rebuy Approval
              </h3>
              {lowStackPlayers.map((p) => (
                <div
                  key={`rebuy-alert-${p.id}`}
                  className="flex items-center justify-between py-1.5 px-2.5 rounded bg-black/40 border border-amber-500/30"
                >
                  <div>
                    <span className="font-bold text-white">{p.displayName}</span>
                    <span className="text-[10px] text-amber-400 ml-2 font-mono">
                      Stack: {stacks[p.id] ?? 0}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => hostApproveRebuy(p.id)}
                    className="px-3 py-1 rounded bg-amber-500 hover:bg-amber-400 text-black font-bold text-[11px] shadow transition-transform active:scale-95"
                  >
                    Grant Rebuy (+{config.startingStack})
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Player Roster & Actions */}
          <div className="bg-emerald-950/40 border border-emerald-900/60 rounded-xl p-3.5 space-y-3">
            <h3 className="font-bold uppercase text-[11px] tracking-wider text-emerald-300">
              Player Roster & Management
            </h3>
            <div className="space-y-2">
              {participants.map((p) => {
                const isDealer = dealerId === p.id;
                const isHostPlayer = p.id === currentView.hostId;
                const stack = stacks[p.id] ?? 0;

                return (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg bg-black/30 border border-emerald-900/40"
                  >
                    <div className="flex items-center gap-2 min-w-[140px]">
                      <span className="font-bold text-white">{p.displayName}</span>
                      {isHostPlayer && (
                        <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1 rounded font-bold">
                          HOST
                        </span>
                      )}
                      {isDealer && (
                        <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/40 px-1 rounded font-bold">
                          DEALER
                        </span>
                      )}
                      {p.seat !== null && (
                        <span className="text-[10px] text-emerald-400 font-mono">
                          Seat #{p.seat}
                        </span>
                      )}
                      <span className="text-[10px] text-zinc-400 font-mono">({stack}c)</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {!isDealer && (
                        <button
                          type="button"
                          onClick={() => setDealer(p.id)}
                          className="px-2 py-1 rounded bg-blue-900/50 hover:bg-blue-800 text-blue-200 border border-blue-700/50 text-[10px] transition-colors"
                        >
                          Make Dealer
                        </button>
                      )}
                      {!isHostPlayer && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Transfer host privileges to ${p.displayName}?`)) {
                              transferHost(p.id);
                            }
                          }}
                          className="px-2 py-1 rounded bg-amber-900/40 hover:bg-amber-800/60 text-amber-200 border border-amber-700/50 text-[10px] transition-colors"
                        >
                          Make Host
                        </button>
                      )}
                      {p.seat !== null && (
                        <button
                          type="button"
                          onClick={() => assignSeat(p.id, null)}
                          className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] transition-colors"
                        >
                          Unseat
                        </button>
                      )}
                      {!isHostPlayer && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Kick ${p.displayName}?`)) {
                              kick(p.id);
                            }
                          }}
                          className="px-2 py-1 rounded bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-800/50 text-[10px] transition-colors"
                        >
                          Kick
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Chip Adjustment */}
          <form
            onSubmit={handleAdjustSubmit}
            className="bg-emerald-950/40 border border-emerald-900/60 rounded-xl p-3.5 space-y-3"
          >
            <h3 className="font-bold uppercase text-[11px] tracking-wider text-emerald-300">
              Manual Chip Correction
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <select
                aria-label="Select player for chip correction"
                value={selectedTarget}
                onChange={(e) => setSelectedTarget(e.target.value)}
                className="bg-black/60 border border-emerald-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
              >
                <option value="">Select player...</option>
                {participants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName} ({stacks[p.id] ?? 0})
                  </option>
                ))}
              </select>

              <select
                aria-label="Select chip adjustment operation"
                value={adjustOp}
                onChange={(e) => setAdjustOp(e.target.value as "set" | "add" | "subtract")}
                className="bg-black/60 border border-emerald-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
              >
                <option value="add">Add (+)</option>
                <option value="subtract">Subtract (-)</option>
                <option value="set">Set to Exact</option>
              </select>

              <input
                type="number"
                min={0}
                step={50}
                value={adjustAmount}
                onChange={(e) =>
                  setAdjustAmount(Math.max(0, Number.parseInt(e.target.value, 10) || 0))
                }
                className="bg-black/60 border border-emerald-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
              />
            </div>
            <button
              type="submit"
              disabled={!selectedTarget}
              className="w-full py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white font-bold transition-all shadow"
            >
              Apply Chip Adjustment
            </button>
          </form>

          {/* Table Config */}
          <div className="bg-emerald-950/40 border border-emerald-900/60 rounded-xl p-3.5 space-y-3">
            <h3 className="font-bold uppercase text-[11px] tracking-wider text-emerald-300">
              Table Configuration
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] text-emerald-400 block mb-1">Min Bet</span>
                <input
                  type="number"
                  defaultValue={config.minBet}
                  onBlur={(e) => {
                    const val = Number.parseInt(e.target.value, 10);
                    if (val > 0) updateConfig({ minBet: val });
                  }}
                  className="w-full bg-black/60 border border-emerald-800 rounded px-2.5 py-1 text-xs text-white"
                />
              </div>
              <div>
                <span className="text-[10px] text-emerald-400 block mb-1">Max Bet</span>
                <input
                  type="number"
                  defaultValue={config.maxBet}
                  onBlur={(e) => {
                    const val = Number.parseInt(e.target.value, 10);
                    if (val > 0) updateConfig({ maxBet: val });
                  }}
                  className="w-full bg-black/60 border border-emerald-800 rounded px-2.5 py-1 text-xs text-white"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
