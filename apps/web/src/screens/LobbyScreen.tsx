import type { SeatNumber } from "@felt/shared";
import type React from "react";
import { useState } from "react";
import { HeaderBar } from "../components/HeaderBar";
import { ChatDrawer } from "../components/modals/ChatDrawer";
import { HostPanelModal } from "../components/modals/HostPanelModal";
import { StandingsModal } from "../components/modals/StandingsModal";
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
  const updateConfig = useGameStore((s) => s.updateConfig);
  const openModal = useGameStore((s) => s.openModal);

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

        {/* Session Finished Summary Banner if previous session ended */}
        {currentView.roundNumber > 0 && !currentView.isSessionStarted && (
          <div className="bg-gold-500/10 border border-gold-400/40 rounded-3xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg animate-fade-in">
            <div className="flex items-center gap-2.5 text-center sm:text-left">
              <span className="text-2xl">🏆</span>
              <div>
                <span className="text-xs font-bold text-gold-300 block">
                  Game Session Ended ({currentView.roundNumber} Rounds Played)
                </span>
                <span className="text-[11px] text-emerald-400/70">
                  Review final player standings and Net PNL.
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => openModal("standings")}
              className="px-4 py-2 rounded-xl bg-gold-400 hover:bg-gold-300 text-black font-bold text-xs shadow transition-transform active:scale-95"
            >
              View Net PNL & Standings
            </button>
          </div>
        )}

        {/* Dealer Assignment & Table Rules */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Dealer Assignment */}
          <div className="bg-[#09180e] border border-emerald-900/60 rounded-3xl p-5 shadow-xl space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-300">
              Dealer Selection
            </h2>
            <div className="text-xs text-emerald-400/80">
              Designated Dealer:{" "}
              <strong className="text-white">
                {participants.find((p) => p.id === dealerId)?.displayName ?? "Host"}
              </strong>
            </div>

            {isHost && (
              <div className="pt-1">
                <span className="text-[11px] text-emerald-500 block mb-1">Assign Dealer to:</span>
                <div className="flex flex-wrap gap-1.5">
                  {participants.map((p) => (
                    <button
                      key={`dealer-sel-${p.id}`}
                      type="button"
                      onClick={() => setDealer(p.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                        dealerId === p.id
                          ? "bg-gold-400/20 text-gold-300 border-gold-400 shadow"
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

          {/* Table Rules (Host editable) */}
          <div className="bg-[#09180e] border border-emerald-900/60 rounded-3xl p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-300">
                Table Rules
              </h2>
              {isHost && (
                <span className="text-[10px] text-gold-400 font-semibold bg-gold-400/10 px-2 py-0.5 rounded border border-gold-400/30">
                  Host Can Edit
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {/* Decks */}
              <div className="bg-black/30 p-2.5 rounded-xl border border-emerald-900/40">
                <span className="text-emerald-500 block text-[10px] uppercase font-bold mb-1">
                  Decks
                </span>
                {isHost ? (
                  <select
                    aria-label="Number of card decks"
                    value={config.decks}
                    onChange={(e) =>
                      updateConfig({
                        decks: Number.parseInt(e.target.value, 10) as 1 | 2 | 4 | 6 | 8,
                      })
                    }
                    className="w-full bg-emerald-950/80 border border-emerald-800/80 text-white rounded px-2 py-1 font-mono font-bold text-xs"
                  >
                    {[1, 2, 4, 6, 8].map((d) => (
                      <option key={d} value={d}>
                        {d} {d === 1 ? "Deck" : "Decks"}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="font-bold text-white font-mono">{config.decks} Decks</span>
                )}
              </div>

              {/* Blackjack Payout */}
              <div className="bg-black/30 p-2.5 rounded-xl border border-emerald-900/40">
                <span className="text-emerald-500 block text-[10px] uppercase font-bold mb-1">
                  BJ Payout
                </span>
                {isHost ? (
                  <select
                    aria-label="Blackjack payout ratio"
                    value={config.blackjackPayout}
                    onChange={(e) =>
                      updateConfig({ blackjackPayout: e.target.value as "3:2" | "6:5" })
                    }
                    className="w-full bg-emerald-950/80 border border-emerald-800/80 text-white rounded px-2 py-1 font-mono font-bold text-xs"
                  >
                    <option value="3:2">3:2 (Standard)</option>
                    <option value="6:5">6:5</option>
                  </select>
                ) : (
                  <span className="font-bold text-white font-mono">{config.blackjackPayout}</span>
                )}
              </div>

              {/* Dealer Rule */}
              <div className="bg-black/30 p-2.5 rounded-xl border border-emerald-900/40">
                <span className="text-emerald-500 block text-[10px] uppercase font-bold mb-1">
                  Dealer Rule
                </span>
                {isHost ? (
                  <select
                    aria-label="Dealer soft 17 rule"
                    value={config.dealerHitsSoft17 ? "H17" : "S17"}
                    onChange={(e) => updateConfig({ dealerHitsSoft17: e.target.value === "H17" })}
                    className="w-full bg-emerald-950/80 border border-emerald-800/80 text-white rounded px-2 py-1 font-semibold text-xs"
                  >
                    <option value="S17">Stands on 17 (S17)</option>
                    <option value="H17">Hits Soft 17 (H17)</option>
                  </select>
                ) : (
                  <span className="font-bold text-white">
                    {config.dealerHitsSoft17 ? "Hits Soft 17 (H17)" : "Stands on 17 (S17)"}
                  </span>
                )}
              </div>

              {/* Double Rule */}
              <div className="bg-black/30 p-2.5 rounded-xl border border-emerald-900/40">
                <span className="text-emerald-500 block text-[10px] uppercase font-bold mb-1">
                  Double Down
                </span>
                {isHost ? (
                  <select
                    aria-label="Double down restriction"
                    value={config.doubleRestriction}
                    onChange={(e) =>
                      updateConfig({ doubleRestriction: e.target.value as "9-11" | "any" })
                    }
                    className="w-full bg-emerald-950/80 border border-emerald-800/80 text-white rounded px-2 py-1 font-semibold text-xs"
                  >
                    <option value="9-11">Hard 9, 10, 11 only</option>
                    <option value="any">Any initial 2 cards</option>
                  </select>
                ) : (
                  <span className="font-bold text-white">
                    {config.doubleRestriction === "9-11" ? "9, 10, 11 only" : "Any 2 cards"}
                  </span>
                )}
              </div>

              {/* Limits */}
              <div className="col-span-2 bg-black/30 p-2.5 rounded-xl border border-emerald-900/40 flex items-center justify-between gap-3">
                <div className="flex-1">
                  <span className="text-emerald-500 block text-[10px] uppercase font-bold mb-1">
                    Min Bet
                  </span>
                  {isHost ? (
                    <input
                      type="number"
                      defaultValue={config.minBet}
                      onBlur={(e) => {
                        const val = Number.parseInt(e.target.value, 10);
                        if (val > 0) updateConfig({ minBet: val });
                      }}
                      className="w-full bg-emerald-950/80 border border-emerald-800/80 text-white rounded px-2 py-1 font-mono font-bold text-xs"
                    />
                  ) : (
                    <span className="font-bold text-white font-mono">₹{config.minBet}</span>
                  )}
                </div>
                <div className="flex-1">
                  <span className="text-emerald-500 block text-[10px] uppercase font-bold mb-1">
                    Max Bet
                  </span>
                  {isHost ? (
                    <input
                      type="number"
                      defaultValue={config.maxBet}
                      onBlur={(e) => {
                        const val = Number.parseInt(e.target.value, 10);
                        if (val > 0) updateConfig({ maxBet: val });
                      }}
                      className="w-full bg-emerald-950/80 border border-emerald-800/80 text-white rounded px-2 py-1 font-mono font-bold text-xs"
                    />
                  ) : (
                    <span className="font-bold text-white font-mono">₹{config.maxBet}</span>
                  )}
                </div>
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
      <StandingsModal />
    </div>
  );
};
