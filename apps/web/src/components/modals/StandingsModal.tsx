import type React from "react";
import { useGameStore } from "../../store/game-store";
import { AVATAR_OPTIONS } from "../../types/avatars";

interface SparklineProps {
  points: number[];
  isPositive: boolean;
}

const Sparkline: React.FC<SparklineProps> = ({ points, isPositive }) => {
  if (points.length < 2) {
    return <span className="w-12 text-center text-[10px] text-emerald-600/40 font-mono">—</span>;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max === min ? 1 : max - min;
  const w = 48;
  const h = 14;
  const coords = points
    .map((val, idx) => {
      const x = (idx / (points.length - 1)) * w;
      const y = h - ((val - min) / range) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} className="overflow-visible shrink-0">
      <title>Chip Trend</title>
      <polyline
        fill="none"
        stroke={isPositive ? "#34d399" : "#f43f5e"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={coords}
      />
    </svg>
  );
};

export const StandingsModal: React.FC = () => {
  const activeModal = useGameStore((s) => s.activeModal);
  const closeModal = useGameStore((s) => s.closeModal);
  const currentView = useGameStore((s) => s.currentView);
  const myPlayerId = useGameStore((s) => s.myPlayerId);
  const dealerNextRound = useGameStore((s) => s.dealerNextRound);

  if (activeModal !== "standings" || !currentView) {
    return null;
  }

  const {
    participants,
    stacks,
    config,
    dealerBank,
    roundNumber,
    phase,
    dealerId,
    hostId,
    hands,
    stackHistory,
  } = currentView;
  const isDealerOrHost = myPlayerId === dealerId || myPlayerId === hostId;
  const isRoundSummary = phase === "round_summary";

  // Sort participants by stack descending
  const sortedParticipants = [...participants].sort((a, b) => {
    const stackA = stacks[a.id] ?? 0;
    const stackB = stacks[b.id] ?? 0;
    return stackB - stackA;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg max-h-[90vh] bg-[#0c1a11] border border-gold-400/40 rounded-3xl flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-emerald-900/50 bg-black/40">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏆</span>
            <div>
              <h2 className="text-base font-bold text-gold-300 tracking-wide">
                Table Standings & Chip Net
              </h2>
              <p className="text-[11px] text-emerald-400/70 font-mono">
                Round {roundNumber} • Dealer Bank:{" "}
                {dealerBank > 0 ? `+${dealerBank.toLocaleString()}` : dealerBank.toLocaleString()}
              </p>
            </div>
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
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* Top 3 Podium if Session Over */}
          {sortedParticipants.length >= 3 && isRoundSummary && (
            <div className="grid grid-cols-3 gap-2 p-3 bg-black/40 border border-gold-400/30 rounded-2xl text-center">
              {/* 2nd Place */}
              <div className="flex flex-col items-center justify-end pb-1">
                <span className="text-lg">🥈</span>
                <span className="font-bold text-white text-[11px] truncate max-w-[80px]">
                  {sortedParticipants[1]?.displayName}
                </span>
                <span className="text-[10px] text-zinc-400 font-mono">
                  ${(stacks[sortedParticipants[1]?.id ?? ""] ?? 0).toLocaleString()}
                </span>
              </div>
              {/* 1st Place */}
              <div className="flex flex-col items-center justify-end pb-2">
                <span className="text-2xl animate-bounce">👑</span>
                <span className="font-black text-gold-300 text-xs truncate max-w-[90px]">
                  {sortedParticipants[0]?.displayName}
                </span>
                <span className="text-[11px] text-gold-400 font-mono font-bold">
                  ${(stacks[sortedParticipants[0]?.id ?? ""] ?? 0).toLocaleString()}
                </span>
              </div>
              {/* 3rd Place */}
              <div className="flex flex-col items-center justify-end pb-1">
                <span className="text-lg">🥉</span>
                <span className="font-bold text-white text-[11px] truncate max-w-[80px]">
                  {sortedParticipants[2]?.displayName}
                </span>
                <span className="text-[10px] text-zinc-400 font-mono">
                  ${(stacks[sortedParticipants[2]?.id ?? ""] ?? 0).toLocaleString()}
                </span>
              </div>
            </div>
          )}

          {/* Recent Round Hand Results if round_summary */}
          {isRoundSummary && hands.length > 0 && (
            <div className="bg-emerald-950/40 border border-emerald-800/40 rounded-2xl p-3 space-y-2">
              <h3 className="font-bold text-white text-[11px] uppercase tracking-wider text-emerald-300">
                Round {roundNumber} Outcomes
              </h3>
              <div className="space-y-1.5">
                {hands.map((hand) => {
                  const p = participants.find((part) => part.id === hand.playerId);
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
                          Bet: ${hand.bet + hand.doubleBet}
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

          {/* Leaderboard Table with Sparklines */}
          <div className="bg-emerald-950/40 border border-emerald-800/40 rounded-2xl overflow-hidden">
            <div className="grid grid-cols-12 px-3 py-2 bg-black/40 text-[10px] font-bold text-emerald-400 uppercase tracking-wider border-b border-emerald-900/40 items-center">
              <span className="col-span-1 text-center">#</span>
              <span className="col-span-4">Player</span>
              <span className="col-span-2 text-center">Trend</span>
              <span className="col-span-2 text-right">Stack</span>
              <span className="col-span-3 text-right">Net</span>
            </div>

            <div className="divide-y divide-emerald-900/30">
              {sortedParticipants.map((p, index) => {
                const stack = stacks[p.id] ?? 0;
                const buyIn = config.startingStack;
                const net = stack - buyIn;
                const isMe = p.id === myPlayerId;
                const avatar = AVATAR_OPTIONS.find((a) => a.id === p.avatarId) ?? AVATAR_OPTIONS[0];

                // Build history points for sparkline
                const points = stackHistory ? stackHistory.map((h) => h[p.id] ?? buyIn) : [];
                if (points.length === 0 || points[points.length - 1] !== stack) {
                  points.push(stack);
                }

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
                    <div className="col-span-4 flex items-center gap-2 min-w-0">
                      <span className="text-sm shrink-0">{avatar?.emoji ?? "🦁"}</span>
                      <div className="truncate">
                        <span className={`font-bold ${isMe ? "text-gold-300" : "text-white"}`}>
                          {p.displayName}
                        </span>
                        {isMe && (
                          <span className="text-[10px] text-emerald-400 font-mono ml-1">(You)</span>
                        )}
                        {p.seat !== null && (
                          <span className="block text-[10px] text-emerald-500/70 font-mono">
                            Seat {p.seat}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Sparkline Column */}
                    <div className="col-span-2 flex justify-center">
                      <Sparkline points={points} isPositive={net >= 0} />
                    </div>

                    <span className="col-span-2 text-right font-mono font-bold text-white">
                      ${stack.toLocaleString()}
                    </span>
                    <span
                      className={`col-span-3 text-right font-mono font-bold ${
                        net > 0 ? "text-emerald-400" : net < 0 ? "text-rose-400" : "text-zinc-400"
                      }`}
                    >
                      {net > 0 ? `+$${net.toLocaleString()}` : `$${net.toLocaleString()}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
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
