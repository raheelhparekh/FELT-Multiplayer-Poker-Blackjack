import type React from "react";
import { useEffect, useState } from "react";
import { useCountdownTimer } from "../hooks/useCountdownTimer";
import { useAuthStore } from "../store/auth-store";
import { useGameStore } from "../store/game-store";
import { CASINO_THEMES, useSettingsStore } from "../store/settings-store";
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
  const updateConfig = useGameStore((s) => s.updateConfig);

  const theme = useSettingsStore((s) => s.theme);
  const _cycleTheme = useSettingsStore((s) => s.cycleTheme);
  const activeThemeMeta = CASINO_THEMES.find((t) => t.id === theme) ?? CASINO_THEMES[0];

  const _user = useAuthStore((s) => s.user);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [copied, setCopied] = useState(false);

  // Active deadline based on current game phase
  const currentDeadline =
    currentView?.phase === "betting"
      ? currentView.betDeadline
      : currentView?.phase === "insurance"
        ? currentView.insuranceDeadline
        : currentView?.phase === "player_turns"
          ? currentView.actionDeadline
          : null;

  const timer = useCountdownTimer({
    deadline: currentDeadline,
    isPaused: currentView?.isPaused,
    pausedRemainingMs: currentView?.pausedRemainingMs,
    totalDurationSec: 30,
    playTickAudio: false,
    resetKey: `${currentView?.phase}-${currentView?.activeHandId ?? ""}-${currentDeadline ?? 0}`,
  });

  useEffect(() => {
    if (!errorMessage) return;
    const t = setTimeout(() => clearError(), 4000);
    return () => clearTimeout(t);
  }, [errorMessage, clearError]);

  if (!currentView) return null;

  const isHost = currentView.hostId === myPlayerId;
  const phase = currentView.phase;
  const round = currentView.roundNumber;
  const code = roomCode || currentView.roomCode;

  const handleCopyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      /* ignore */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFeltColorClick = () => {
    const validThemes = CASINO_THEMES.map((t) => t.id);
    const currentTableTheme = (currentView?.config.tableTheme ?? theme) as (typeof validThemes)[number];
    const currentIndex = validThemes.indexOf(currentTableTheme);
    const nextTheme = validThemes[(currentIndex + 1) % validThemes.length] ?? "classic-green";
    if (isHost) {
      updateConfig({ tableTheme: nextTheme });
    } else {
      useGameStore.setState({ errorMessage: "Only the host can change the felt color." });
    }
  };

  const getPhaseBadge = () => {
    if (currentView.isPaused)
      return { text: "PAUSED", short: "⏸", color: "bg-rose-500/20 text-rose-300 border-rose-500/30" };
    switch (phase) {
      case "betting":
        return { text: "BETTING", short: "BET", color: "bg-amber-500/20 text-amber-300 border-amber-500/30" };
      case "dealing":
        return { text: "DEALING", short: "DEAL", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" };
      case "insurance":
        return { text: "INSURANCE", short: "INS", color: "bg-purple-500/20 text-purple-300 border-purple-500/30" };
      case "peek":
        return { text: "PEEK", short: "PEEK", color: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30" };
      case "player_turns":
        return { text: "YOUR TURN", short: "TURN", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" };
      case "dealer_turn":
        return { text: "DEALER", short: "DLRN", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" };
      case "settlement":
        return { text: "SETTLE", short: "WIN", color: "bg-gold-400/20 text-gold-300 border-gold-400/30" };
      case "round_summary":
        return { text: "ROUND OVER", short: "END", color: "bg-gold-400/20 text-gold-300 border-gold-400/30" };
      default:
        return { text: "LOBBY", short: "LOBBY", color: "bg-zinc-800/60 text-zinc-300 border-zinc-700/50" };
    }
  };

  const badge = getPhaseBadge();

  // ─── Connection dot colour ───────────────────────────────────────────────
  const dotColor =
    connectionStatus === "connected"
      ? "bg-emerald-400 shadow-[0_0_6px_#10b981]"
      : connectionStatus === "connecting"
        ? "bg-amber-400 animate-pulse"
        : "bg-rose-500";

  return (
    <>
      {/* ─── MOBILE HEADER  (two-row, visible below sm breakpoint) ──────────── */}
      <header className="sm:hidden bg-black/80 backdrop-blur-md border-b border-emerald-900/40 z-30 select-none">
        {/* Row 1: Room code · status · phase/timer · leave */}
        <div className="flex items-center justify-between px-2 pt-2 pb-1.5 gap-1.5">
          {/* Room code pill */}
          <button
            type="button"
            onClick={handleCopyCode}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-950/80 border border-emerald-800/60 active:scale-95 transition-all shrink-0"
            title="Tap to copy room code"
          >
            <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-500">TABLE</span>
            <span className="text-gold-300 font-black tracking-widest text-xs font-mono">{code}</span>
            <span className="text-[10px] text-emerald-400/80">{copied ? "✓" : "📋"}</span>
          </button>

          {/* Connection dot */}
          <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} title={`Status: ${connectionStatus}`} />

          {/* Phase badge + timer — flex-1 centred */}
          <div className="flex items-center gap-1 flex-1 justify-center min-w-0">
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border ${badge.color}`}>
              {badge.short}
            </span>

            {timer.seconds !== null && !currentView.isPaused && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold border shrink-0 ${
                  timer.isUrgent
                    ? "bg-rose-950/90 text-rose-300 border-rose-500 animate-urgent-timer shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                    : "bg-black/60 text-amber-300 border-amber-500/40"
                }`}
              >
                ⏱ {timer.formatted}
              </span>
            )}

            {currentView.isPaused && currentView.pausedRemainingMs && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-950/80 text-amber-300 border border-amber-500/40 shrink-0">
                ⏸ {Math.ceil(currentView.pausedRemainingMs / 1000)}s
              </span>
            )}

            {round > 0 && (
              <span className="text-[10px] text-emerald-400/70 font-mono shrink-0">R{round}</span>
            )}
          </div>

          {/* Leave button */}
          <button
            type="button"
            onClick={() => { if (window.confirm("Leave this table?")) leaveRoom(); }}
            className="w-8 h-8 rounded-lg bg-zinc-900/60 border border-zinc-700/50 hover:bg-rose-950/60 text-zinc-400 hover:text-rose-300 flex items-center justify-center active:scale-95 transition-all shrink-0"
            title="Leave Table"
            aria-label="Leave Table"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <title>Leave</title>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>

        {/* Row 2: Icon action strip */}
        <div className="flex items-center border-t border-emerald-900/30 divide-x divide-emerald-900/30">
          {/* Felt colour */}
          <button
            type="button"
            onClick={handleFeltColorClick}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold text-emerald-200 active:bg-white/5 transition-all"
            title={isHost ? "Change felt colour (all players)" : "Felt colour set by host"}
          >
            <div className="w-3 h-3 rounded-full border border-white/60" style={{ backgroundColor: activeThemeMeta?.fromColor }} />
            <span className="text-[10px] text-emerald-300">{activeThemeMeta?.colorName}</span>
          </button>

          {/* Chat */}
          <button
            type="button"
            onClick={() => openModal("chat")}
            className="relative flex-1 flex items-center justify-center py-2 text-emerald-200 active:bg-white/5 transition-all"
            title="Chat"
            aria-label="Chat"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <title>Chat</title>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {unreadChatCount > 0 && (
              <span className="absolute top-1 right-[calc(50%-14px)] bg-amber-500 text-black text-[8px] font-black rounded-full h-3.5 min-w-[14px] px-0.5 flex items-center justify-center shadow">
                {unreadChatCount > 9 ? "9+" : unreadChatCount}
              </span>
            )}
          </button>

          {/* Standings */}
          <button
            type="button"
            onClick={() => openModal("standings")}
            className="flex-1 flex items-center justify-center py-2 text-gold-300 active:bg-white/5 transition-all"
            title="Standings"
            aria-label="Standings"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <title>Standings</title>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </button>

          {/* Host (only if host) */}
          {isHost && (
            <button
              type="button"
              onClick={() => openModal("host")}
              className="flex-1 flex items-center justify-center gap-1 py-2 text-amber-300 active:bg-white/5 transition-all"
              title="Host Controls"
              aria-label="Host Controls"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <title>Host</title>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-[10px] font-extrabold uppercase tracking-wide">HOST</span>
            </button>
          )}

          {/* Settings */}
          <button
            type="button"
            onClick={() => openModal("settings")}
            className="flex-1 flex items-center justify-center py-2 text-emerald-200 active:bg-white/5 transition-all"
            title="Settings"
            aria-label="Settings"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <title>Settings</title>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </button>
        </div>
      </header>

      {/* ─── DESKTOP HEADER  (single row, visible at sm+) ───────────────────── */}
      <header className="hidden sm:flex h-14 bg-black/70 backdrop-blur-md border-b border-emerald-900/40 px-3 items-center justify-between z-30 select-none">
        {/* Left: Room Code & Connection */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopyCode}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-950/80 border border-emerald-800/60 hover:bg-emerald-900/60 active:scale-95 transition-all text-xs font-mono font-bold tracking-wider text-emerald-100 shrink-0"
            title="Click to copy Room Code"
          >
            <span className="text-emerald-400 text-xs">TABLE</span>
            <span className="text-gold-300 font-black tracking-widest">{code}</span>
            <span className="text-[10px] text-emerald-400/80">{copied ? "✓" : "📋"}</span>
          </button>
          <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} title={`Status: ${connectionStatus}`} />
        </div>

        {/* Center: Phase, Round & Timer */}
        <div className="flex items-center gap-2 shrink min-w-0">
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border ${badge.color}`}>
            {badge.text}
          </span>

          {timer.seconds !== null && !currentView.isPaused && (
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-bold border shrink-0 ${
                timer.isUrgent
                  ? "bg-rose-950/90 text-rose-300 border-rose-500 animate-urgent-timer shadow-[0_0_10px_rgba(239,68,68,0.5)]"
                  : "bg-black/60 text-amber-300 border-amber-500/40"
              }`}
            >
              ⏱ {timer.formatted}
            </span>
          )}

          {currentView.isPaused && currentView.pausedRemainingMs && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-950/80 text-amber-300 border border-amber-500/40 shrink-0">
              ⏸ {Math.ceil(currentView.pausedRemainingMs / 1000)}s
            </span>
          )}

          {round > 0 && (
            <span className="text-xs text-emerald-400/80 font-mono shrink-0">R{round}</span>
          )}
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Felt colour */}
          <button
            type="button"
            onClick={handleFeltColorClick}
            className="h-9 px-2 rounded-lg bg-black/60 border border-emerald-800/40 hover:border-gold-400/60 active:scale-95 transition-all flex items-center gap-1.5"
            title={isHost ? `Felt: ${activeThemeMeta?.feltLabel} — tap to change` : `Felt: ${activeThemeMeta?.feltLabel}`}
            aria-label="Change Casino Felt Color"
          >
            <div className="w-3.5 h-3.5 rounded-full border border-white/70" style={{ backgroundColor: activeThemeMeta?.fromColor }} />
            <span className="text-[10px] font-bold text-emerald-200 hidden lg:inline">{activeThemeMeta?.colorName}</span>
          </button>

          {/* Chat */}
          <button type="button" onClick={() => openModal("chat")} className="relative w-9 h-9 rounded-lg bg-emerald-950/60 border border-emerald-800/40 hover:bg-emerald-900/50 text-emerald-200 flex items-center justify-center active:scale-95 transition-all" title="Chat" aria-label="Chat">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><title>Chat</title><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            {unreadChatCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-amber-500 text-black text-[9px] font-black rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center shadow">
                {unreadChatCount > 9 ? "9+" : unreadChatCount}
              </span>
            )}
          </button>

          {/* Standings */}
          <button type="button" onClick={() => openModal("standings")} className="w-9 h-9 rounded-lg bg-emerald-950/60 border border-emerald-800/40 hover:bg-emerald-900/50 text-gold-300 flex items-center justify-center active:scale-95 transition-all" title="Standings" aria-label="Standings">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><title>Standings</title><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
          </button>

          {/* Host Panel */}
          {isHost && (
            <button type="button" onClick={() => openModal("host")} className="h-9 px-2 rounded-lg bg-amber-950/60 border border-amber-600/50 hover:bg-amber-900/50 text-amber-300 flex items-center gap-1 active:scale-95 transition-all" title="Host Controls" aria-label="Host Controls">
              <span className="text-[11px] font-bold">HOST</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><title>Host Controls</title><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
          )}

          {/* Settings */}
          <button type="button" onClick={() => openModal("settings")} className="w-9 h-9 rounded-lg bg-emerald-950/60 border border-emerald-800/40 hover:bg-emerald-900/50 text-emerald-200 flex items-center justify-center active:scale-95 transition-all" title="Settings" aria-label="Settings">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><title>Settings</title><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
          </button>

          {/* Leave */}
          <button
            type="button"
            onClick={() => { if (window.confirm("Leave this table?")) leaveRoom(); }}
            className="w-9 h-9 rounded-lg bg-zinc-900/60 border border-zinc-700/50 hover:bg-rose-950/60 hover:border-rose-800/60 text-zinc-400 hover:text-rose-300 flex items-center justify-center active:scale-95 transition-all"
            title="Leave Table"
            aria-label="Leave Table"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><title>Leave</title><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
          </button>
        </div>
      </header>

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
      <HistoryModal isOpen={showHistoryModal} onClose={() => setShowHistoryModal(false)} />

      {/* Floating Error Toast */}
      {errorMessage && (
        <aside
          aria-label="Error Notification"
          className="fixed top-[5.5rem] sm:top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 bg-rose-950/95 border border-rose-500/80 text-rose-100 text-xs font-semibold rounded-2xl shadow-2xl backdrop-blur-md animate-bounce max-w-[90vw] text-center"
        >
          <span>⚠️ {errorMessage}</span>
          <button
            type="button"
            onClick={clearError}
            className="text-rose-400 hover:text-white font-bold ml-1.5 p-0.5 cursor-pointer shrink-0"
            title="Dismiss error"
          >
            ✕
          </button>
        </aside>
      )}
    </>
  );
};
