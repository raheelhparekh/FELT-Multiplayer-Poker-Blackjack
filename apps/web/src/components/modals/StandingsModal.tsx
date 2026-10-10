import type { ClientHand, Participant } from "@felt/shared";
import type React from "react";
import { useState } from "react";
import { useGameStore } from "../../store/game-store";
import { AVATAR_OPTIONS } from "../../types/avatars";

export const StandingsModal: React.FC = () => {
  const activeModal = useGameStore((s) => s.activeModal);
  const closeModal = useGameStore((s) => s.closeModal);
  const currentView = useGameStore((s) => s.currentView);
  const myPlayerId = useGameStore((s) => s.myPlayerId);
  const dealerNextRound = useGameStore((s) => s.dealerNextRound);

  const [activeTab, setActiveTab] = useState<"standings" | "transactions">("standings");
  const [filterPlayerId, setFilterPlayerId] = useState<string>("all");

  if (activeModal !== "standings" || !currentView) {
    return null;
  }

  const {
    participants,
    stacks,
    totalBuyIns = {},
    config,
    dealerBank,
    dealerTotalBuyIn,
    roundNumber,
    phase,
    dealerId,
    hostId,
    hands,
    isSessionStarted,
  } = currentView;

  const isDealerOrHost = myPlayerId === dealerId || myPlayerId === hostId;
  const isRoundSummary = phase === "round_summary";
  const isSessionOver = !isSessionStarted || phase === "lobby";

  const initialBuyIns = currentView.initialBuyIns ?? {};
  const rebuys = currentView.rebuys ?? {};

  // Calculate each participant's accurate stack, buy-in and net PNL
  const participantData = participants.map((p: Participant) => {
    const isDealer = p.id === dealerId;
    const stack = isDealer ? dealerBank : (stacks[p.id] ?? 0);
    const initial = isDealer
      ? (dealerTotalBuyIn ?? config.dealerStartingBank)
      : (initialBuyIns[p.id] ??
        (totalBuyIns[p.id] !== undefined
          ? Math.min(totalBuyIns[p.id]!, config.startingStack)
          : config.startingStack));
    const extraChips = isDealer
      ? 0
      : (rebuys[p.id] ?? Math.max(0, (totalBuyIns[p.id] ?? 0) - initial));
    const buyIn = isDealer
      ? (dealerTotalBuyIn ?? config.dealerStartingBank)
      : (totalBuyIns[p.id] ?? config.startingStack);
    const net = stack - buyIn;
    return { participant: p, isDealer, stack, initialBuyIn: initial, extraChips, buyIn, net };
  });

  // Sort by net PNL descending (highest profit first)
  const sortedData = [...participantData].sort((a, b) => b.net - a.net);

  const totalTableNet = sortedData.reduce((sum, item) => sum + item.net, 0);

  const transactions = currentView.transactions ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-xl max-h-[90vh] bg-[#0c1a11] border border-gold-400/40 rounded-3xl flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 pt-4 pb-3 border-b border-emerald-900/50 bg-black/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">{activeTab === "standings" ? "🏆" : "📜"}</span>
              <div>
                <h2 className="text-base font-bold text-gold-300 tracking-wide">
                  {isSessionOver ? "Session Summary & Financials" : "Table Standings & Ledger"}
                </h2>
                <p className="text-[11px] text-emerald-400/70 font-mono">
                  {isSessionOver ? "Session Completed" : `Round ${roundNumber}`} • House Bank:{" "}
                  <span className="text-white font-bold">₹{dealerBank.toLocaleString()}</span>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={closeModal}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-emerald-400 hover:text-white hover:bg-emerald-900/50 transition-colors text-base"
            >
              ✕
            </button>
          </div>

          {/* Tab Selector */}
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={() => setActiveTab("standings")}
              className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === "standings"
                  ? "bg-gold-400 text-black shadow-md"
                  : "bg-emerald-950/60 text-emerald-300 hover:bg-emerald-900/40 border border-emerald-800/40"
              }`}
            >
              🏆 Standings & PNL
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("transactions")}
              className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === "transactions"
                  ? "bg-gold-400 text-black shadow-md"
                  : "bg-emerald-950/60 text-emerald-300 hover:bg-emerald-900/40 border border-emerald-800/40"
              }`}
            >
              📜 Transaction Statement ({transactions.length})
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {activeTab === "standings" && (
            <>
              {/* Top 3 Podium if Session Over or Round Summary */}
              {sortedData.length >= 2 && (isSessionOver || isRoundSummary) && (
                <div className="grid grid-cols-3 gap-2 p-3 bg-black/40 border border-gold-400/30 rounded-2xl text-center items-end">
                  {/* 2nd Place */}
                  <div className="flex flex-col items-center justify-end pb-1">
                    <span className="text-lg">🥈</span>
                    <span className="font-bold text-white text-[11px] truncate max-w-[80px]">
                      {sortedData[1]?.participant.displayName}
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold ${
                        (sortedData[1]?.net ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {(sortedData[1]?.net ?? 0) >= 0 ? "+" : ""}₹
                      {sortedData[1]?.net.toLocaleString()}
                    </span>
                  </div>
                  {/* 1st Place */}
                  <div className="flex flex-col items-center justify-end pb-2">
                    <span className="text-2xl animate-bounce">👑</span>
                    <span className="font-black text-gold-300 text-xs truncate max-w-[90px]">
                      {sortedData[0]?.participant.displayName}
                    </span>
                    <span
                      className={`text-[11px] font-mono font-bold ${
                        (sortedData[0]?.net ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {(sortedData[0]?.net ?? 0) >= 0 ? "+" : ""}₹
                      {sortedData[0]?.net.toLocaleString()}
                    </span>
                  </div>
                  {/* 3rd Place */}
                  {sortedData[2] && (
                    <div className="flex flex-col items-center justify-end pb-1">
                      <span className="text-lg">🥉</span>
                      <span className="font-bold text-white text-[11px] truncate max-w-[80px]">
                        {sortedData[2]?.participant.displayName}
                      </span>
                      <span
                        className={`text-[10px] font-mono font-bold ${
                          (sortedData[2]?.net ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {(sortedData[2]?.net ?? 0) >= 0 ? "+" : ""}₹
                        {sortedData[2]?.net.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Recent Round Hand Results if round_summary */}
              {isRoundSummary && hands.length > 0 && (
                <div className="bg-emerald-950/40 border border-emerald-800/40 rounded-2xl p-3 space-y-2">
                  <h3 className="font-bold text-white text-[11px] uppercase tracking-wider text-emerald-300">
                    Round {roundNumber} Outcomes
                  </h3>
                  <div className="space-y-1.5">
                    {hands.map((hand: ClientHand) => {
                      const p = participants.find((part: Participant) => part.id === hand.playerId);
                      const isWin = hand.result === "win" || hand.result === "blackjack";
                      const isPush = hand.result === "push";
                      const isLoss = hand.result === "loss" || hand.result === "bust";

                      return (
                        <div
                          key={hand.id}
                          className="flex items-center justify-between py-1.5 px-2.5 rounded-xl bg-black/30 text-xs"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-white">
                              {p ? p.displayName : `Seat ${hand.seatNumber}`}
                            </span>
                            {hand.isSplit && (
                              <span className="text-[10px] text-emerald-400 font-mono">
                                [Hand {hand.splitOrder + 1}]
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-emerald-400/70 font-mono">
                              Bet: ₹{hand.bet + hand.doubleBet}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                isWin
                                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                  : isPush
                                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                    : isLoss
                                      ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                                      : "text-zinc-400"
                              }`}
                            >
                              {hand.result}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Live Standings Table */}
              <div className="bg-emerald-950/40 border border-emerald-800/40 rounded-2xl overflow-hidden shadow">
                <div className="grid grid-cols-12 px-3 py-2 bg-black/50 text-[10px] font-bold text-emerald-400 uppercase tracking-wider border-b border-emerald-900/40 items-center">
                  <span className="col-span-1 text-center">#</span>
                  <span className="col-span-4">Player</span>
                  <span className="col-span-3 text-right">Buy-in / Extra</span>
                  <span className="col-span-2 text-right">Balance</span>
                  <span className="col-span-2 text-right">Net PNL</span>
                </div>

                <div className="divide-y divide-emerald-900/30">
                  {sortedData.map((item, index: number) => {
                    const { participant: p, isDealer, stack, buyIn, extraChips, net } = item;
                    const isMe = p.id === myPlayerId;
                    const avatar =
                      AVATAR_OPTIONS.find((a) => a.id === p.avatarId) ?? AVATAR_OPTIONS[0];

                    return (
                      <div
                        key={p.id}
                        className={`grid grid-cols-12 px-3 py-2.5 items-center transition-colors ${
                          isMe ? "bg-emerald-800/20" : "hover:bg-black/20"
                        }`}
                      >
                        <span className="col-span-1 text-center font-bold text-emerald-500 text-xs">
                          {index + 1}
                        </span>
                        <div className="col-span-4 flex items-center gap-2 min-w-0 pr-1">
                          <span className="text-base shrink-0">{avatar?.emoji ?? "🦁"}</span>
                          <div className="truncate">
                            <div className="flex items-center gap-1">
                              <span
                                className={`font-bold text-xs truncate ${
                                  isMe ? "text-gold-300" : "text-white"
                                }`}
                              >
                                {p.displayName}
                              </span>
                              {isMe && (
                                <span className="text-[9px] text-emerald-400 font-mono shrink-0">
                                  (You)
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              {isDealer && (
                                <span className="text-[9px] bg-blue-500/20 text-blue-300 border border-blue-500/40 px-1 rounded font-bold">
                                  DEALER
                                </span>
                              )}
                              {p.id === hostId && (
                                <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1 rounded font-bold">
                                  HOST
                                </span>
                              )}
                              {!p.isConnected && (
                                <span className="text-[9px] bg-zinc-800 text-zinc-400 border border-zinc-700 px-1 rounded font-bold">
                                  LEFT
                                </span>
                              )}
                              {!isDealer && p.seat !== null && (
                                <span className="text-[9px] text-emerald-500/70 font-mono">
                                  Seat {p.seat}
                                </span>
                              )}
                              {currentView.pendingChipAdjustmentPlayers?.includes(p.id) && (
                                <span
                                  className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1 rounded font-bold"
                                  title="Chip adjustment or rebuy queued for next round"
                                >
                                  ADJ PENDING
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Buy-in / Extra Chips */}
                        <div className="col-span-3 text-right font-mono">
                          <span className="text-xs font-bold text-white block">
                            ₹{buyIn.toLocaleString()}
                          </span>
                          {extraChips > 0 && (
                            <span className="text-[9px] text-amber-300/90 font-semibold block">
                              +₹{extraChips.toLocaleString()} extra
                            </span>
                          )}
                        </div>

                        {/* Current Stack / Balance */}
                        <span className="col-span-2 text-right font-mono font-bold text-white text-xs">
                          ₹{stack.toLocaleString()}
                        </span>

                        {/* Net PNL */}
                        <span
                          className={`col-span-2 text-right font-mono font-bold text-xs ${
                            net > 0
                              ? "text-emerald-400"
                              : net < 0
                                ? "text-rose-400"
                                : "text-zinc-400"
                          }`}
                        >
                          {net > 0 ? `+₹${net.toLocaleString()}` : `₹${net.toLocaleString()}`}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Zero-Sum Balance Check Footer */}
                <div className="px-3 py-2 bg-black/60 border-t border-emerald-900/40 flex items-center justify-between text-[11px] font-mono text-emerald-400/80">
                  <span>Table PNL Balance</span>
                  <span
                    className={`font-bold ${totalTableNet === 0 ? "text-emerald-400" : "text-amber-400"}`}
                  >
                    ₹{totalTableNet.toLocaleString()} (Zero-Sum Verified)
                  </span>
                </div>
              </div>
            </>
          )}

          {activeTab === "transactions" && (
            <div className="space-y-3">
              {/* Filter by player */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-emerald-400 font-bold text-xs uppercase tracking-wider">
                  Transaction Ledger
                </span>
                <select
                  value={filterPlayerId}
                  onChange={(e) => setFilterPlayerId(e.target.value)}
                  className="bg-black/50 border border-emerald-800/60 rounded-lg px-2.5 py-1 text-white text-xs font-semibold focus:outline-none"
                >
                  <option value="all">All Players ({transactions.length})</option>
                  {myPlayerId && <option value={myPlayerId}>My Transactions Only</option>}
                  {participants.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName} {p.id === myPlayerId ? "(You)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              {transactions.filter(
                (tx) => filterPlayerId === "all" || tx.playerId === filterPlayerId,
              ).length === 0 ? (
                <div className="p-8 text-center bg-black/30 border border-emerald-900/40 rounded-2xl text-emerald-500/70 font-mono text-xs">
                  No transactions recorded yet.
                </div>
              ) : (
                <div className="bg-emerald-950/40 border border-emerald-800/40 rounded-2xl overflow-hidden shadow">
                  <div className="grid grid-cols-12 px-3 py-2 bg-black/50 text-[10px] font-bold text-emerald-400 uppercase tracking-wider border-b border-emerald-900/40 items-center">
                    <span className="col-span-2">Round</span>
                    <span className="col-span-4">Player</span>
                    <span className="col-span-3">Type</span>
                    <span className="col-span-3 text-right">Amount / Bal</span>
                  </div>

                  <div className="divide-y divide-emerald-900/30 max-h-[50vh] overflow-y-auto">
                    {transactions
                      .filter((tx) => filterPlayerId === "all" || tx.playerId === filterPlayerId)
                      .slice()
                      .reverse()
                      .map((tx) => {
                        const isAdjustment = tx.type === "adjustment";
                        const isNegative =
                          tx.type === "round_loss" ||
                          (isAdjustment &&
                            (tx.details?.includes("deducted") || tx.details?.includes("subtract")));
                        const isPositive =
                          tx.type === "buy_in" ||
                          tx.type === "rebuy" ||
                          tx.type === "round_win" ||
                          (isAdjustment && !isNegative && tx.amount > 0);
                        const isChipRequest = tx.type === "chip_request";

                        const typeLabel =
                          tx.type === "buy_in"
                            ? "Initial Buy-in"
                            : tx.type === "chip_request"
                              ? "Chip Request"
                              : tx.type === "rebuy"
                                ? "Chips Granted"
                                : tx.type === "round_win"
                                  ? "Round Win"
                                  : tx.type === "round_loss"
                                    ? "Round Loss"
                                    : tx.type === "round_push"
                                      ? "Round Push"
                                      : isAdjustment
                                        ? isNegative
                                          ? "Chips Deducted"
                                          : "Chips Added (Host)"
                                        : "Adjustment";

                        const typeColor =
                          tx.type === "buy_in"
                            ? "text-blue-400 font-bold"
                            : tx.type === "chip_request"
                              ? "text-amber-400 font-bold"
                              : tx.type === "rebuy"
                                ? "text-purple-300 font-bold"
                                : tx.type === "round_win"
                                  ? "text-emerald-400 font-bold"
                                  : tx.type === "round_loss"
                                    ? "text-rose-400"
                                    : isAdjustment && !isNegative
                                      ? "text-cyan-300 font-bold"
                                      : isAdjustment && isNegative
                                        ? "text-rose-400 font-bold"
                                        : "text-zinc-400";

                        return (
                          <div
                            key={tx.id}
                            className="grid grid-cols-12 px-3 py-2 items-center hover:bg-black/20 text-xs font-mono"
                          >
                            <span className="col-span-2 text-emerald-500/80 font-bold">
                              {tx.roundNumber === 0 ? "Entry" : `R${tx.roundNumber}`}
                            </span>
                            <span className="col-span-4 font-semibold text-white truncate pr-1">
                              {tx.displayName}
                            </span>
                            <div className="col-span-3">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-[11px] block truncate ${typeColor}`}>
                                  {typeLabel}
                                </span>
                                {isChipRequest && (
                                  <span
                                    className={`text-[8px] font-sans px-1 rounded font-bold uppercase tracking-wider ${
                                      tx.status === "approved"
                                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                        : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                    }`}
                                  >
                                    {tx.status === "approved" ? "Approved" : "Pending"}
                                  </span>
                                )}
                              </div>
                              {tx.details && (
                                <span className="text-[9px] text-zinc-500 block truncate">
                                  {tx.details}
                                </span>
                              )}
                            </div>
                            <div className="col-span-3 text-right">
                              <span
                                className={`font-bold block ${
                                  isChipRequest
                                    ? "text-amber-400"
                                    : isPositive
                                      ? "text-emerald-400"
                                      : isNegative
                                        ? "text-rose-400"
                                        : "text-zinc-400"
                                }`}
                              >
                                {isChipRequest
                                  ? `₹${tx.amount.toLocaleString()}`
                                  : isPositive
                                    ? `+₹${tx.amount.toLocaleString()}`
                                    : isNegative
                                      ? `-₹${tx.amount.toLocaleString()}`
                                      : `₹${tx.amount.toLocaleString()}`}
                              </span>
                              <span className="text-[10px] text-emerald-500/60 block">
                                {isChipRequest && tx.status === "pending"
                                  ? "Req Pending"
                                  : `Bal: ₹${tx.balanceAfter.toLocaleString()}`}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-emerald-900/50 bg-black/40 flex items-center justify-between">
          <button
            type="button"
            onClick={closeModal}
            className="px-4 py-2 rounded-xl bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/50 font-semibold transition-all text-xs"
          >
            Close
          </button>

          {isRoundSummary && isDealerOrHost && (
            <button
              type="button"
              onClick={() => {
                dealerNextRound();
                closeModal();
              }}
              className="px-5 py-2 rounded-xl bg-gold-400 hover:bg-gold-300 text-black font-bold text-xs tracking-wider shadow-lg transition-transform active:scale-95"
            >
              Start Next Round →
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
