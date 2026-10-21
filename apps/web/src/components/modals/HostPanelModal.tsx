import type { Participant, TableTheme, PlayerTransaction } from "@felt/shared";
import type React from "react";
import { useState } from "react";
import { useGameStore } from "../../store/game-store";
import { CASINO_THEMES } from "../../store/settings-store";

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
  const hostRejectRebuy = useGameStore((s) => s.hostRejectRebuy);

  const forceStand = useGameStore((s) => s.forceStand);
  const cancelRound = useGameStore((s) => s.cancelRound);
  const recoverDealer = useGameStore((s) => s.recoverDealer);
  const closeTable = useGameStore((s) => s.closeTable);

  // Chip adjustment local state
  const [selectedTarget, setSelectedTarget] = useState<string>("");
  const [adjustOp, setAdjustOp] = useState<"set" | "add" | "subtract">("add");
  const [adjustAmount, setAdjustAmount] = useState<number>(500);
  const [newDealerCandidate, setNewDealerCandidate] = useState<string>("");

  if (activeModal !== "host" || !currentView || currentView.hostId !== myPlayerId) {
    return null;
  }

  const isPoker = currentView.gameType === "poker";
  const { participants, stacks, config, dealerId, isPaused } = currentView;
  const isRoundActive = isPoker
    ? currentView.phase !== "lobby" && (currentView.phase as string) !== "hand_summary"
    : currentView.phase !== "lobby" && currentView.phase !== "round_summary";

  const handleAdjustSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTarget || adjustAmount <= 0) return;
    adjustChips(selectedTarget, adjustOp, adjustAmount);
  };

  const pendingBuyIns = (currentView.transactions ?? []).filter(
    (tx: PlayerTransaction) => tx.type === "chip_request" && tx.status === "pending",
  );

  const lowStackThreshold = isPoker
    ? ((config as any).bigBlind ?? 20)
    : (config.minBet ?? 10);
  const lowStackPlayers = participants.filter((p: Participant) => {
    const stack = stacks[p.id] ?? 0;
    return stack < lowStackThreshold;
  });

  const defaultRebuyAmount = isPoker
    ? ((config as any).rebuyAmount ?? (config as any).minBuyIn ?? 1000)
    : Math.min(20000, config.startingStack);

  const pokerCfg = config as any;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg max-h-[90vh] bg-[#0c1810] border border-amber-500/40 rounded-2xl flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-emerald-900/50 bg-black/40">
          <div className="flex items-center gap-2">
            <span className="text-amber-400 font-bold">⚙</span>
            <h2 className="text-base font-bold text-white tracking-wide">
              {isPoker ? "Poker Table Controls" : "Blackjack Host Controls"}
            </h2>
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
          {/* Pending Buy-In / Rebuy Requests (Crucial Host Control) */}
          {pendingBuyIns.length > 0 && (
            <div className="bg-amber-950/60 border-2 border-amber-500 rounded-xl p-3.5 space-y-3 shadow-lg shadow-amber-500/10">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold uppercase text-[11px] tracking-wider text-amber-300 flex items-center gap-2">
                  <span className="text-sm">🪙</span>
                  <span>Pending Buy-In / Rebuy Requests ({pendingBuyIns.length})</span>
                </h3>
                <span className="text-[10px] bg-amber-500/30 text-amber-300 font-bold px-2 py-0.5 rounded-full border border-amber-500/40">
                  Action Required
                </span>
              </div>
              <div className="space-y-2">
                {pendingBuyIns.map((tx) => {
                  const player = participants.find((p) => p.id === tx.playerId);
                  const name = player?.displayName ?? tx.displayName;
                  const currentStack = stacks[tx.playerId] ?? 0;

                  return (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-black/60 border border-amber-500/40"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-white text-xs truncate">{name}</span>
                        <div className="flex items-center gap-2 text-[10px] text-zinc-400 font-mono mt-0.5">
                          <span>Request: <strong className="text-gold-300">₹{tx.amount.toLocaleString()}</strong></span>
                          <span>•</span>
                          <span>Stack: ₹{currentStack.toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => hostRejectRebuy(tx.playerId)}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800/60 font-bold text-[11px] transition-transform active:scale-95"
                        >
                          Decline
                        </button>
                        <button
                          type="button"
                          onClick={() => hostApproveRebuy(tx.playerId, tx.amount)}
                          className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-[11px] shadow transition-transform active:scale-95"
                        >
                          Approve
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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

          {/* Table Recovery & Host Overrides */}
          <div className="bg-rose-950/30 border border-rose-800/50 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold uppercase text-[11px] tracking-wider text-rose-300 flex items-center gap-1.5">
                <span>🛡️</span> Table Recovery & Host Overrides
              </h3>
              <span className="text-[10px] text-rose-400/80 font-mono">Emergency controls</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => forceStand()}
                disabled={
                  isPoker
                    ? currentView.phase !== "betting" || !(currentView as any).toActPlayerId
                    : currentView.phase !== "player_turns" || !currentView.activeHandId
                }
                className="py-2 px-2.5 rounded-lg bg-amber-900/60 hover:bg-amber-800 disabled:opacity-40 text-amber-200 border border-amber-700/50 font-bold transition-all text-[11px] text-left"
                title={isPoker ? "Force advance stalled turn" : "Advance stalled blackjack hand"}
              >
                <span className="block font-bold">
                  {isPoker ? "⏭ Force Advance Turn" : "⏭ Force Stand Turn"}
                </span>
                <span className="block text-[9px] text-amber-300/70 font-normal">
                  {isPoker ? "Check/Fold stalled player" : "Unstick stalled hand"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const msg = isPoker
                    ? "Cancel this hand and refund all pot bets to players?"
                    : "Cancel this round and refund all bets to players?";
                  if (window.confirm(msg)) {
                    cancelRound();
                  }
                }}
                disabled={currentView.phase === "lobby"}
                className="py-2 px-2.5 rounded-lg bg-rose-900/60 hover:bg-rose-800 disabled:opacity-40 text-rose-200 border border-rose-700/50 font-bold transition-all text-[11px] text-left"
                title={isPoker ? "Cancel hand and refund pot" : "Cancel round and refund bets"}
              >
                <span className="block font-bold">
                  {isPoker ? "↩ Cancel Hand" : "↩ Cancel Round"}
                </span>
                <span className="block text-[9px] text-rose-300/70 font-normal">
                  Refund all in-play bets
                </span>
              </button>
            </div>

            {/* Dealer Recovery Selector (Blackjack only, since in Poker dealer is a seat button) */}
            {!isPoker && (
              <div className="pt-1 border-t border-rose-900/40">
                <span className="text-[10px] text-rose-300/90 block mb-1">
                  Replace / Recover Dealer (spectator or host):
                </span>
                <div className="flex gap-2">
                  <select
                    aria-label="New Dealer Candidate"
                    value={newDealerCandidate}
                    onChange={(e) => setNewDealerCandidate(e.target.value)}
                    className="flex-1 bg-black/60 border border-rose-800/60 rounded px-2 py-1 text-xs text-white"
                  >
                    <option value="">Select replacement dealer...</option>
                    {participants
                      .filter((p) => p.isConnected && p.seat === null && p.id !== dealerId)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.displayName} {p.id === currentView.hostId ? "(Host)" : "(Spectator)"}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    disabled={!newDealerCandidate}
                    onClick={() => {
                      recoverDealer(newDealerCandidate);
                      setNewDealerCandidate("");
                    }}
                    className="px-3 py-1 rounded bg-rose-800 hover:bg-rose-700 disabled:opacity-40 text-white font-bold text-xs transition-all"
                  >
                    Set Dealer
                  </button>
                </div>
              </div>
            )}

            {/* Permanent Close Table */}
            <div className="pt-2 border-t border-rose-900/40">
              <button
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      "Permanently close this table? All players will be disconnected and the room destroyed.",
                    )
                  ) {
                    closeTable();
                    closeModal();
                  }
                }}
                className="w-full py-1.5 px-3 rounded-lg bg-red-950/80 hover:bg-red-900 text-rose-300 border border-red-700/60 font-bold text-[11px] transition-all text-center"
              >
                🚫 Close Table (Remove Room)
              </button>
            </div>
          </div>

          {/* Low Chip Players / Quick Rebuy Approval */}
          {lowStackPlayers.length > 0 && (
            <div className="bg-amber-950/40 border border-amber-500/50 rounded-xl p-3.5 space-y-2">
              <h3 className="font-bold text-amber-300 uppercase text-[11px] tracking-wider">
                Low Chips Alert
              </h3>
              {lowStackPlayers.map((p: Participant) => (
                <div
                  key={`rebuy-alert-${p.id}`}
                  className="flex items-center justify-between py-1.5 px-2.5 rounded bg-black/40 border border-amber-500/30"
                >
                  <div>
                    <span className="font-bold text-white">{p.displayName}</span>
                    <span className="text-[10px] text-amber-400 ml-2 font-mono">
                      Stack: ₹{stacks[p.id] ?? 0}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => hostApproveRebuy(p.id, defaultRebuyAmount)}
                    className="px-3 py-1 rounded bg-amber-500 hover:bg-amber-400 text-black font-bold text-[11px] shadow transition-transform active:scale-95"
                  >
                    Grant Rebuy (+₹{defaultRebuyAmount.toLocaleString()})
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
              {participants.map((p: Participant) => {
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
                      {!isPoker && isDealer && (
                        <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/40 px-1 rounded font-bold">
                          DEALER
                        </span>
                      )}
                      {p.seat !== null && (
                        <span className="text-[10px] text-emerald-400 font-mono">
                          Seat #{p.seat}
                        </span>
                      )}
                      <span className="text-[10px] text-zinc-400 font-mono">(₹{stack})</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {!isPoker && !isDealer && !isRoundActive && (
                        <button
                          type="button"
                          onClick={() => setDealer(p.id)}
                          className="px-2 py-1 rounded bg-blue-900/50 hover:bg-blue-800 text-blue-200 border border-blue-700/50 text-[10px] transition-colors"
                        >
                          Make Dealer
                        </button>
                      )}
                      {!isHostPlayer && !isRoundActive && (
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
                {participants.map((p: Participant) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName} (₹{stacks[p.id] ?? 0})
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

          {/* Table Configuration — DISTINCT FOR POKER VS BLACKJACK */}
          <div className="bg-emerald-950/40 border border-emerald-900/60 rounded-xl p-3.5 space-y-3">
            <h3 className="font-bold uppercase text-[11px] tracking-wider text-emerald-300 flex items-center justify-between">
              <span>{isPoker ? "Poker Table Configuration" : "Blackjack Rules & Configuration"}</span>
              <span className="text-[10px] text-amber-400/80 font-normal lowercase">
                ({isPoker ? "Texas Hold'em" : "Blackjack 21"})
              </span>
            </h3>

            {isPoker ? (
              /* ─── POKER HOST SETTINGS ─────────────────────────── */
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[10px] text-emerald-400 block mb-1">Small Blind</span>
                  <input
                    type="number"
                    min={1}
                    defaultValue={pokerCfg.smallBlind ?? 10}
                    onBlur={(e) => {
                      const val = Number.parseInt(e.target.value, 10);
                      if (val > 0) updateConfig({ smallBlind: val });
                    }}
                    className="w-full bg-black/60 border border-emerald-800 rounded px-2.5 py-1 text-xs text-white font-mono"
                  />
                </div>

                <div>
                  <span className="text-[10px] text-emerald-400 block mb-1">Big Blind</span>
                  <input
                    type="number"
                    min={2}
                    defaultValue={pokerCfg.bigBlind ?? 20}
                    onBlur={(e) => {
                      const val = Number.parseInt(e.target.value, 10);
                      if (val > 0) updateConfig({ bigBlind: val });
                    }}
                    className="w-full bg-black/60 border border-emerald-800 rounded px-2.5 py-1 text-xs text-white font-mono"
                  />
                </div>

                <div>
                  <span className="text-[10px] text-emerald-400 block mb-1">Min Buy-In</span>
                  <input
                    type="number"
                    min={50}
                    defaultValue={pokerCfg.minBuyIn ?? 200}
                    onBlur={(e) => {
                      const val = Number.parseInt(e.target.value, 10);
                      if (val > 0) updateConfig({ minBuyIn: val });
                    }}
                    className="w-full bg-black/60 border border-emerald-800 rounded px-2.5 py-1 text-xs text-white font-mono"
                  />
                </div>

                <div>
                  <span className="text-[10px] text-emerald-400 block mb-1">Max Buy-In</span>
                  <input
                    type="number"
                    min={100}
                    max={20000}
                    defaultValue={pokerCfg.maxBuyIn ?? 2000}
                    onBlur={(e) => {
                      const val = Number.parseInt(e.target.value, 10);
                      if (val > 0) updateConfig({ maxBuyIn: val });
                    }}
                    className="w-full bg-black/60 border border-emerald-800 rounded px-2.5 py-1 text-xs text-white font-mono"
                  />
                </div>

                <div>
                  <span className="text-[10px] text-emerald-400 block mb-1">Action Timer</span>
                  <select
                    aria-label="Action Timer"
                    value={pokerCfg.actionTimerSec ?? 20}
                    onChange={(e) =>
                      updateConfig({ actionTimerSec: Number.parseInt(e.target.value, 10) })
                    }
                    className="w-full bg-black/60 border border-emerald-800 rounded px-2.5 py-1 text-xs text-white"
                  >
                    {[10, 15, 20, 30, 45, 60].map((sec) => (
                      <option key={sec} value={sec}>
                        {sec} Seconds
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <span className="text-[10px] text-emerald-400 block mb-1">Time Bank</span>
                  <select
                    aria-label="Time Bank"
                    value={pokerCfg.timeBankSec ?? 30}
                    onChange={(e) =>
                      updateConfig({ timeBankSec: Number.parseInt(e.target.value, 10) })
                    }
                    className="w-full bg-black/60 border border-emerald-800 rounded px-2.5 py-1 text-xs text-white"
                  >
                    {[0, 15, 30, 60, 90].map((sec) => (
                      <option key={sec} value={sec}>
                        {sec === 0 ? "Disabled" : `${sec} Seconds`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <span className="text-[10px] text-emerald-400 block mb-1">Auto Next Hand</span>
                  <select
                    aria-label="Auto Next Hand Delay"
                    value={pokerCfg.autoNextHandDelaySec ?? 3}
                    onChange={(e) =>
                      updateConfig({ autoNextHandDelaySec: Number.parseInt(e.target.value, 10) })
                    }
                    className="w-full bg-black/60 border border-emerald-800 rounded px-2.5 py-1 text-xs text-white"
                  >
                    {[1, 2, 3, 5, 8].map((sec) => (
                      <option key={sec} value={sec}>
                        {sec} Seconds
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <span className="text-[10px] text-emerald-400 block mb-1">Max Table Seats</span>
                  <select
                    aria-label="Max Table Seats"
                    value={pokerCfg.maxPlayerSeats ?? pokerCfg.maxSeats ?? 6}
                    onChange={(e) =>
                      updateConfig({ maxPlayerSeats: Number.parseInt(e.target.value, 10) } as any)
                    }
                    className="w-full bg-black/60 border border-emerald-800 rounded px-2.5 py-1 text-xs text-white"
                  >
                    {[2, 4, 6, 8, 9].map((seats) => (
                      <option key={seats} value={seats}>
                        {seats} Seats
                      </option>
                    ))}
                  </select>
                </div>

                {/* Buy-In Approval Control */}
                <div className="col-span-2 bg-black/40 border border-emerald-800/60 rounded-lg p-2.5 flex items-center justify-between">
                  <div className="flex flex-col pr-2">
                    <span className="font-bold text-white text-xs">
                      Require Host Approval for Buy-Ins
                    </span>
                    <span className="text-[10px] text-zinc-400">
                      When enabled, chip requests must be approved by the host before chips are granted
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={pokerCfg.rebuyRequiresHostApproval !== false}
                    onChange={(e) => updateConfig({ rebuyRequiresHostApproval: e.target.checked })}
                    className="w-4 h-4 rounded border-emerald-700 text-amber-500 focus:ring-0 cursor-pointer"
                  />
                </div>

                <div className="col-span-2">
                  <span className="text-[10px] text-emerald-400 block mb-1">
                    Table Felt Color Theme (Changes for all players)
                  </span>
                  <select
                    aria-label="Table Felt Color Theme"
                    value={config.tableTheme ?? "classic-green"}
                    onChange={(e) => updateConfig({ tableTheme: e.target.value as TableTheme })}
                    className="w-full bg-black/60 border border-emerald-800 rounded px-2.5 py-1.5 text-xs text-white"
                  >
                    {CASINO_THEMES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.feltLabel})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              /* ─── BLACKJACK HOST SETTINGS ─────────────────────── */
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[10px] text-emerald-400 block mb-1">Decks</span>
                  <select
                    aria-label="Decks"
                    value={config.decks}
                    onChange={(e) =>
                      updateConfig({
                        decks: Number.parseInt(e.target.value, 10) as 1 | 2 | 4 | 6 | 8,
                      })
                    }
                    className="w-full bg-black/60 border border-emerald-800 rounded px-2.5 py-1 text-xs text-white"
                  >
                    {[1, 2, 4, 6, 8].map((d) => (
                      <option key={d} value={d}>
                        {d} {d === 1 ? "Deck" : "Decks"}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <span className="text-[10px] text-emerald-400 block mb-1">BJ Payout</span>
                  <select
                    aria-label="BJ Payout"
                    value={config.blackjackPayout}
                    onChange={(e) =>
                      updateConfig({ blackjackPayout: e.target.value as "3:2" | "6:5" })
                    }
                    className="w-full bg-black/60 border border-emerald-800 rounded px-2.5 py-1 text-xs text-white"
                  >
                    <option value="3:2">3:2</option>
                    <option value="6:5">6:5</option>
                  </select>
                </div>

                <div>
                  <span className="text-[10px] text-emerald-400 block mb-1">Dealer Rule</span>
                  <select
                    aria-label="Dealer Rule"
                    value={config.dealerHitsSoft17 ? "H17" : "S17"}
                    onChange={(e) => updateConfig({ dealerHitsSoft17: e.target.value === "H17" })}
                    className="w-full bg-black/60 border border-emerald-800 rounded px-2.5 py-1 text-xs text-white"
                  >
                    <option value="S17">Stands on 17 (S17)</option>
                    <option value="H17">Hits Soft 17 (H17)</option>
                  </select>
                </div>

                <div>
                  <span className="text-[10px] text-emerald-400 block mb-1">Double Down</span>
                  <select
                    aria-label="Double Down"
                    value={config.doubleRestriction}
                    onChange={(e) =>
                      updateConfig({ doubleRestriction: e.target.value as "9-11" | "any" })
                    }
                    className="w-full bg-black/60 border border-emerald-800 rounded px-2.5 py-1 text-xs text-white"
                  >
                    <option value="9-11">Hard 9, 10, 11 only</option>
                    <option value="any">Any initial 2 cards</option>
                  </select>
                </div>

                <div className="col-span-2">
                  <span className="text-[10px] text-emerald-400 block mb-1">
                    Table Felt Color Theme (Changes for all players)
                  </span>
                  <select
                    aria-label="Table Felt Color Theme"
                    value={config.tableTheme ?? "classic-green"}
                    onChange={(e) => updateConfig({ tableTheme: e.target.value as TableTheme })}
                    className="w-full bg-black/60 border border-emerald-800 rounded px-2.5 py-1.5 text-xs text-white"
                  >
                    {CASINO_THEMES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.feltLabel})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <span className="text-[10px] text-emerald-400 block mb-1">Min Bet</span>
                  <input
                    type="number"
                    min={1}
                    defaultValue={config.minBet}
                    onBlur={(e) => {
                      const val = Number.parseInt(e.target.value, 10);
                      if (val > 0) updateConfig({ minBet: val });
                    }}
                    className="w-full bg-black/60 border border-emerald-800 rounded px-2.5 py-1 text-xs text-white"
                  />
                </div>

                <div>
                  <span className="text-[10px] text-emerald-400 block mb-1">
                    Max Bet (Max ₹5,000)
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={5000}
                    defaultValue={config.maxBet}
                    onBlur={(e) => {
                      const raw = Number.parseInt(e.target.value, 10);
                      if (raw > 0) {
                        const val = Math.min(5000, Math.max(1, raw));
                        updateConfig({ maxBet: val });
                      }
                    }}
                    className="w-full bg-black/60 border border-emerald-800 rounded px-2.5 py-1 text-xs text-white"
                  />
                </div>

                <div className="col-span-2 bg-black/40 border border-emerald-800/60 rounded-lg p-2.5 flex items-center justify-between">
                  <div className="flex flex-col pr-2">
                    <span className="font-bold text-white text-xs">
                      Require Host Approval for Rebuys
                    </span>
                    <span className="text-[10px] text-zinc-400">
                      When enabled, chip requests must be approved by the host
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.rebuyRequiresHostApproval !== false}
                    onChange={(e) => updateConfig({ rebuyRequiresHostApproval: e.target.checked })}
                    className="w-4 h-4 rounded border-emerald-700 text-amber-500 focus:ring-0 cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
