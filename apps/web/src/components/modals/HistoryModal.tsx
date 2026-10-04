import type React from "react";
import { useEffect } from "react";
import { useAuthStore } from "../../store/auth-store";

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({ isOpen, onClose }) => {
  const user = useAuthStore((s) => s.user);
  const history = useAuthStore((s) => s.history);
  const stats = useAuthStore((s) => s.careerStats);
  const fetchMySessions = useAuthStore((s) => s.fetchMySessions);

  useEffect(() => {
    if (isOpen && user) {
      fetchMySessions();
    }
  }, [isOpen, user, fetchMySessions]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg max-h-[85vh] bg-[#0c1810] border border-gold-400/40 rounded-3xl flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-emerald-900/50 bg-black/40">
          <div className="flex items-center gap-2">
            <span className="text-xl">📜</span>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                Career Stats & History
              </h2>
              <span className="text-[11px] text-emerald-400/70">
                {user ? `${user.username} (${user.email})` : "Guest Player"}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-emerald-400 hover:text-white hover:bg-emerald-900/50 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs text-emerald-200">
          {/* Career Summary Tiles */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-black/40 border border-emerald-900/50 p-2.5 rounded-2xl text-center">
                <span className="text-[10px] text-emerald-500 block uppercase">Sessions</span>
                <span className="font-mono font-bold text-white text-base">
                  {stats.totalSessions}
                </span>
              </div>
              <div className="bg-black/40 border border-emerald-900/50 p-2.5 rounded-2xl text-center">
                <span className="text-[10px] text-emerald-500 block uppercase">Rounds</span>
                <span className="font-mono font-bold text-white text-base">
                  {stats.totalRounds}
                </span>
              </div>
              <div className="bg-black/40 border border-emerald-900/50 p-2.5 rounded-2xl text-center">
                <span className="text-[10px] text-emerald-500 block uppercase">Net Chips</span>
                <span
                  className={`font-mono font-bold text-base ${
                    stats.totalNet > 0
                      ? "text-emerald-400"
                      : stats.totalNet < 0
                        ? "text-rose-400"
                        : "text-zinc-400"
                  }`}
                >
                  {stats.totalNet > 0
                    ? `+₹${stats.totalNet.toLocaleString()}`
                    : `₹${stats.totalNet.toLocaleString()}`}
                </span>
              </div>
              <div className="bg-black/40 border border-emerald-900/50 p-2.5 rounded-2xl text-center">
                <span className="text-[10px] text-emerald-500 block uppercase">Win Rate</span>
                <span className="font-mono font-bold text-gold-300 text-base">
                  {stats.totalSessions > 0
                    ? `${Math.round((stats.winningSessions / stats.totalSessions) * 100)}%`
                    : "0%"}
                </span>
              </div>
            </div>
          )}

          {/* Past Sessions List */}
          <div className="space-y-2">
            <h3 className="font-bold text-white uppercase text-[11px] tracking-wider text-emerald-300">
              Completed Table Sessions
            </h3>

            {history.length === 0 ? (
              <div className="p-6 text-center text-emerald-600/60 italic bg-black/20 rounded-2xl border border-emerald-950">
                No completed sessions recorded yet. Finish a table session to see your stats here!
              </div>
            ) : (
              <div className="space-y-2">
                {history.map((item) => {
                  const dateStr = new Date(item.endedAt).toLocaleDateString([], {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  return (
                    <div
                      key={item.sessionId}
                      className="p-3 rounded-2xl bg-black/40 border border-emerald-900/40 flex items-center justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-xs font-mono">
                            Table {item.roomCode}
                          </span>
                          <span className="text-[10px] text-emerald-400/60 font-mono">
                            {item.rounds} rounds
                          </span>
                        </div>
                        <span className="text-[10px] text-zinc-500">{dateStr}</span>
                      </div>

                      <div className="text-right">
                        <span
                          className={`font-mono font-bold text-sm block ${
                            item.net > 0
                              ? "text-emerald-400"
                              : item.net < 0
                                ? "text-rose-400"
                                : "text-zinc-400"
                          }`}
                        >
                          {item.net > 0
                            ? `+₹${item.net.toLocaleString()}`
                            : `₹${item.net.toLocaleString()}`}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          Final: ₹{item.finalStack.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-emerald-900/50 bg-black/40 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-gold-400 hover:bg-gold-300 text-black font-bold text-xs tracking-wider shadow transition-transform active:scale-95"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
