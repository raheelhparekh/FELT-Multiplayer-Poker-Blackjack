import type React from "react";
import { useEffect, useState } from "react";
import { useAuthStore } from "../store/auth-store";
import { useGameStore } from "../store/game-store";
import { AuthModal } from "./modals/AuthModal";
import { HistoryModal } from "./modals/HistoryModal";

export const HeaderBar: React.FC = () => {
  const currentView = useGameStore((s) => s.currentView);
  const roomCode = useGameStore((s) => s.roomCode);
  const connectionStatus = useGameStore((s) => s.connectionStatus);
  const unreadChatCount = useGameStore((s) => s.unreadChatCount);
  const myPlayerId = useGameStore((s) => s.myPlayerId);
  const openModal = useGameStore((s) => s.openModal);
  const leaveRoom = useGameStore((s) => s.leaveRoom);
  const errorMessage = useGameStore((s) => s.errorMessage);
  const clearError = useGameStore((s) => s.clearError);

  const _user = useAuthStore((s) => s.user);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!errorMessage) return;
    const timer = setTimeout(() => {
      clearError();
    }, 4000);
    return () => clearTimeout(timer);
  }, [errorMessage, clearError]);

  if (!currentView) return null;

  const isHost = currentView.hostId === myPlayerId;
  const phase = currentView.phase;
  const round = currentView.roundNumber;

  const handleCopyCode = async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getPhaseBadge = () => {
    if (currentView.isPaused) {
      return { text: "PAUSED", color: "bg-rose-500/20 text-rose-300 border-rose-500/30" };
    }
    switch (phase) {
      case "betting":
        return { text: "BETTING", color: "bg-amber-500/20 text-amber-300 border-amber-500/30" };
      case "dealing":
        return { text: "DEALING", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" };
      case "insurance":
        return {
          text: "INSURANCE",
          color: "bg-purple-500/20 text-purple-300 border-purple-500/30",
        };
      case "peek":
        return { text: "PEEK", color: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30" };
      case "player_turns":
        return {
          text: "PLAYER TURNS",
          color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
        };
      case "dealer_turn":
        return { text: "DEALER TURN", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" };
      case "settlement":
        return { text: "SETTLEMENT", color: "bg-gold-400/20 text-gold-300 border-gold-400/30" };
      case "round_summary":
        return { text: "ROUND OVER", color: "bg-gold-400/20 text-gold-300 border-gold-400/30" };
      default:
        return { text: "LOBBY", color: "bg-zinc-800/60 text-zinc-300 border-zinc-700/50" };
    }
  };

  const badge = getPhaseBadge();

  return (
    <header className="h-14 bg-black/60 backdrop-blur border-b border-emerald-900/40 px-3 flex items-center justify-between z-30 select-none">
      {/* Left: Room Code & Connection */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleCopyCode}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-950/70 border border-emerald-800/50 hover:bg-emerald-900/60 active:scale-95 transition-all text-xs font-mono font-bold tracking-wider text-emerald-100"
          title="Click to copy Room Code"
        >
          <span className="text-emerald-400">TABLE</span>
          <span className="text-gold-300 font-black">{roomCode || currentView.roomCode}</span>
          <span className="text-[10px] text-emerald-400/80">{copied ? "✓ Copied" : "📋"}</span>
        </button>

        {/* Connection status indicator */}
        <div
          className={`w-2 h-2 rounded-full ${
            connectionStatus === "connected"
              ? "bg-emerald-400 shadow-[0_0_8px_#10b981]"
              : connectionStatus === "connecting"
                ? "bg-amber-400 animate-pulse"
                : "bg-rose-500"
          }`}
          title={`Status: ${connectionStatus}`}
        />
      </div>

      {/* Center: Phase & Round */}
      <div className="flex items-center gap-2">
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border ${badge.color}`}
        >
          {badge.text}
        </span>
        {round > 0 && (
          <span className="text-xs text-emerald-400/80 font-mono hidden sm:inline">R{round}</span>
        )}
      </div>

      {/* Right: Modals & Controls */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Chat / Activity Button */}
        <button
          type="button"
          onClick={() => openModal("chat")}
          className="relative min-w-[38px] h-[38px] px-2 rounded-lg bg-emerald-950/60 border border-emerald-800/40 hover:bg-emerald-900/50 text-emerald-200 flex items-center justify-center active:scale-95 transition-all"
          title="Chat & Activity Log"
          aria-label="Chat & Activity Log"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <title>Chat and Activity</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          {unreadChatCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-amber-500 text-black text-[10px] font-black rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center shadow">
              {unreadChatCount > 9 ? "9+" : unreadChatCount}
            </span>
          )}
        </button>

        {/* Standings Button */}
        <button
          type="button"
          onClick={() => openModal("standings")}
          className="min-w-[38px] h-[38px] px-2 rounded-lg bg-emerald-950/60 border border-emerald-800/40 hover:bg-emerald-900/50 text-gold-300 flex items-center justify-center active:scale-95 transition-all"
          title="Standings & Chip Counts"
          aria-label="Standings"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <title>Standings</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
        </button>

        {/* Host Panel (Host only) */}
        {isHost && (
          <button
            type="button"
            onClick={() => openModal("host")}
            className="min-w-[38px] h-[38px] px-2 rounded-lg bg-amber-950/60 border border-amber-600/50 hover:bg-amber-900/50 text-amber-300 flex items-center justify-center active:scale-95 transition-all"
            title="Host Controls"
            aria-label="Host Controls"
          >
            <span className="text-xs mr-1 hidden sm:inline font-bold">HOST</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <title>Host Controls</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
        )}

        {/* User Account / History Button - Hidden per user request for now */}

        {/* Settings Button */}
        <button
          type="button"
          onClick={() => openModal("settings")}
          className="min-w-[38px] h-[38px] px-2 rounded-lg bg-emerald-950/60 border border-emerald-800/40 hover:bg-emerald-900/50 text-emerald-200 flex items-center justify-center active:scale-95 transition-all"
          title="Settings & Audio"
          aria-label="Settings"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <title>Settings</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
            />
          </svg>
        </button>

        {/* Leave Table Button */}
        <button
          type="button"
          onClick={() => {
            if (window.confirm("Leave this table?")) {
              leaveRoom();
            }
          }}
          className="min-w-[34px] h-[34px] px-2 rounded-lg bg-zinc-900/60 border border-zinc-700/50 hover:bg-rose-950/60 hover:border-rose-800/60 text-zinc-400 hover:text-rose-300 flex items-center justify-center active:scale-95 transition-all text-xs"
          title="Leave Table"
          aria-label="Leave Table"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <title>Leave Table</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
        </button>
      </div>

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
      <HistoryModal isOpen={showHistoryModal} onClose={() => setShowHistoryModal(false)} />

      {/* Floating Error Toast */}
      {errorMessage && (
        <aside
          aria-label="Error Notification"
          className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 bg-rose-950/95 border border-rose-500/80 text-rose-100 text-xs font-semibold rounded-2xl shadow-2xl backdrop-blur-md animate-bounce"
        >
          <span>⚠️ {errorMessage}</span>
          <button
            type="button"
            onClick={clearError}
            className="text-rose-400 hover:text-white font-bold ml-1.5 p-0.5 cursor-pointer"
            title="Dismiss error"
          >
            ✕
          </button>
        </aside>
      )}
    </header>
  );
};
