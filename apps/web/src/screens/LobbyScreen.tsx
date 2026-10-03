import type { SeatNumber } from "@felt/shared";
import type React from "react";
import { useState } from "react";
import { HeaderBar } from "../components/HeaderBar";
import { ChatDrawer } from "../components/modals/ChatDrawer";
import { HostPanelModal } from "../components/modals/HostPanelModal";
import { useGameStore } from "../store/game-store";
import { AVATAR_OPTIONS } from "../types/avatars";

export const LobbyScreen: React.FC = () => {
  const currentView = useGameStore((s) => s.currentView);
  const roomCode = useGameStore((s) => s.roomCode);
  const myPlayerId = useGameStore((s) => s.myPlayerId);
  const sit = useGameStore((s) => s.sit);
  const stand = useGameStore((s) => s.stand);
  const startSession = useGameStore((s) => s.startSession);
  const setDealer = useGameStore((s) => s.setDealer);

  const [copied, setCopied] = useState(false);

  if (!currentView) return null;

  const { participants, config, dealerId, hostId } = currentView;
  const isHost = myPlayerId === hostId;
  const myParticipant = participants.find((p) => p.id === myPlayerId);
  const mySeat = myParticipant?.seat ?? null;

  // Seats 1 to 7
  const seats: SeatNumber[] = [1, 2, 3, 4, 5, 6, 7];

  const handleShare = async () => {
    const shareUrl = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Join my Blackjack Table on FELT",
          text: `Join table ${roomCode}!`,
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Fallback
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const seatedCount = participants.filter((p) => p.seat !== null).length;

  return (
    <div className="min-h-screen flex flex-col bg-[#07140b] text-emerald-100 overflow-x-hidden">
      <HeaderBar />

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Lobby Invite Banner */}
        <div className="bg-[#0b1c11] border border-emerald-800/60 rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="space-y-1 text-center sm:text-left">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
              Waiting for players to take seats
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-wide">
              Table Room: <span className="text-gold-300 font-mono">{roomCode}</span>
            </h1>
            <p className="text-xs text-emerald-400/80">
              {participants.length} player(s) in room • {seatedCount}/7 seats occupied
            </p>
          </div>

          <button
            type="button"
            onClick={handleShare}
            className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-2xl bg-emerald-800/80 hover:bg-emerald-700/80 active:scale-95 text-emerald-100 border border-emerald-600/50 font-bold text-xs tracking-wider transition-all flex items-center justify-center gap-2 shadow"
          >
            <span>{copied ? "✓ Link Copied!" : "Invite Friends / Copy Link"}</span>
          </button>
        </div>

        {/* 7-Seat Layout */}
        <div className="bg-[#09180e] border border-emerald-900/60 rounded-3xl p-4 sm:p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-300">
              Table Seats
            </h2>
            {mySeat !== null && (
              <button
                type="button"
                onClick={() => stand()}
                className="text-xs text-rose-400 hover:text-rose-300 underline font-semibold"
              >
                Leave Seat #{mySeat}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5">
            {seats.map((seatNum) => {
              const occupant = participants.find((p) => p.seat === seatNum);
              const isOccupantMe = occupant?.id === myPlayerId;
              const avatar = occupant
                ? AVATAR_OPTIONS.find((a) => a.id === occupant.avatarId)
                : null;

              return (
                <div
                  key={`lobby-seat-${seatNum}`}
                  className={`rounded-2xl p-3 flex flex-col items-center justify-between min-h-[120px] border transition-all ${
                    isOccupantMe
                      ? "bg-emerald-800/30 border-gold-400/60 shadow-lg ring-1 ring-gold-400/40"
                      : occupant
                        ? "bg-black/40 border-emerald-800/40"
                        : "bg-emerald-950/20 border-dashed border-emerald-800/30 hover:border-emerald-600/50"
                  }`}
                >
                  <span className="text-[10px] font-mono font-bold text-emerald-500">
                    Seat {seatNum}
                  </span>

                  {occupant ? (
                    <div className="flex flex-col items-center my-1 text-center min-w-0">
                      <span className="text-2xl mb-1">{avatar?.emoji ?? "👤"}</span>
                      <span className="text-xs font-bold text-white truncate max-w-[80px]">
                        {occupant.displayName}
                      </span>
                      {isOccupantMe && (
                        <span className="text-[9px] text-gold-300 font-bold uppercase">(You)</span>
                      )}
                    </div>
                  ) : (
                    <div className="my-auto">
                      <span className="text-xl opacity-30">🪑</span>
                    </div>
                  )}

                  {!occupant && (
                    <button
                      type="button"
                      onClick={() => sit(seatNum)}
                      className="w-full min-h-[34px] rounded-xl bg-emerald-800/60 hover:bg-emerald-700 text-white font-bold text-[11px] active:scale-95 transition-all"
                    >
                      Sit Here
                    </button>
                  )}
                  {occupant && (
                    <div className="text-[10px] text-emerald-400 font-mono">
                      {currentView.stacks[occupant.id] ?? config.startingStack} chips
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Dealer Assignment & Table Rules */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Dealer Assignment */}
          <div className="bg-[#09180e] border border-emerald-900/60 rounded-3xl p-5 shadow-xl space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-300">
              Dealer Selection
            </h2>
            <div className="text-xs text-emerald-400/80">
              {dealerId ? (
                <span>
                  Designated Dealer:{" "}
                  <strong className="text-white">
                    {participants.find((p) => p.id === dealerId)?.displayName ?? "Player"}
                  </strong>
                </span>
              ) : (
                <span>
                  Designated Dealer:{" "}
                  <strong className="text-gold-300">House / Shared Table Dealer</strong>
                </span>
              )}
            </div>

            {isHost && (
              <div className="pt-1">
                <span className="text-[11px] text-emerald-500 block mb-1">Change Dealer to:</span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setDealer("")}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                      !dealerId
                        ? "bg-gold-400/20 text-gold-300 border-gold-400"
                        : "bg-black/30 border-emerald-800 text-emerald-300 hover:bg-black/50"
                    }`}
                  >
                    House Dealer
                  </button>
                  {participants.map((p) => (
                    <button
                      key={`dealer-sel-${p.id}`}
                      type="button"
                      onClick={() => setDealer(p.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                        dealerId === p.id
                          ? "bg-gold-400/20 text-gold-300 border-gold-400"
                          : "bg-black/30 border-emerald-800 text-emerald-300 hover:bg-black/50"
                      }`}
                    >
                      {p.displayName}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Table Rules Summary */}
          <div className="bg-[#09180e] border border-emerald-900/60 rounded-3xl p-5 shadow-xl space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-300">
              Table Rules
            </h2>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-black/30 p-2 rounded-xl">
                <span className="text-emerald-500 block text-[10px]">Decks</span>
                <span className="font-bold text-white font-mono">{config.decks}</span>
              </div>
              <div className="bg-black/30 p-2 rounded-xl">
                <span className="text-emerald-500 block text-[10px]">Blackjack Payout</span>
                <span className="font-bold text-white font-mono">{config.blackjackPayout}</span>
              </div>
              <div className="bg-black/30 p-2 rounded-xl">
                <span className="text-emerald-500 block text-[10px]">Dealer Rule</span>
                <span className="font-bold text-white">
                  {config.dealerHitsSoft17 ? "Hits Soft 17 (H17)" : "Stands on all 17s (S17)"}
                </span>
              </div>
              <div className="bg-black/30 p-2 rounded-xl">
                <span className="text-emerald-500 block text-[10px]">Limits</span>
                <span className="font-bold text-white font-mono">
                  {config.minBet} / {config.maxBet}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Start Game Action (Host only) or Waiting Banner */}
        <div className="pt-2">
          {isHost ? (
            <button
              type="button"
              disabled={seatedCount === 0}
              onClick={() => startSession()}
              className="w-full min-h-[52px] py-3.5 rounded-2xl bg-gold-400 hover:bg-gold-300 active:scale-[0.99] disabled:opacity-40 text-black font-black text-sm tracking-wider shadow-2xl transition-all flex items-center justify-center gap-2"
            >
              <span>Start Blackjack Session</span>
              <span className="text-lg">→</span>
            </button>
          ) : (
            <div className="text-center py-4 bg-emerald-950/30 rounded-2xl border border-emerald-900/40 text-xs text-emerald-400">
              Waiting for the host to start the session... Grab your seat above!
            </div>
          )}
        </div>
      </main>

      {/* Modals & Drawers */}
      <ChatDrawer />
      <HostPanelModal />
    </div>
  );
};
