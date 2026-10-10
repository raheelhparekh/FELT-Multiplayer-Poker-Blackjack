import type React from "react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthModal } from "../components/modals/AuthModal";
import { HistoryModal } from "../components/modals/HistoryModal";
import { useAuthStore } from "../store/auth-store";
import { useGameStore } from "../store/game-store";
import { AVATAR_OPTIONS } from "../types/avatars";

interface LandingScreenProps {
  initialCode?: string | undefined;
}

export const LandingScreen: React.FC<LandingScreenProps> = ({ initialCode = "" }) => {
  const navigate = useNavigate();
  const displayName = useGameStore((s) => s.displayName);
  const avatarId = useGameStore((s) => s.avatarId);
  const errorMessage = useGameStore((s) => s.errorMessage);
  const clearError = useGameStore((s) => s.clearError);
  const setProfile = useGameStore((s) => s.setProfile);
  const createRoom = useGameStore((s) => s.createRoom);
  const joinRoom = useGameStore((s) => s.joinRoom);

  const user = useAuthStore((s) => s.user);
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const _logout = useAuthStore((s) => s.logout);

  const [name, setName] = useState(displayName || "");
  const [selectedAvatar, setSelectedAvatar] = useState(avatarId || "lion");
  const [joinCode, setJoinCode] = useState(initialCode.toUpperCase());
  const [buyIn, setBuyIn] = useState<number>(1000);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Table configuration state when creating a room
  const [showTableRules, setShowTableRules] = useState(false);
  const [decks, setDecks] = useState<1 | 2 | 4 | 6 | 8>(6);
  const [blackjackPayout, setBlackjackPayout] = useState<"3:2" | "6:5">("3:2");
  const [dealerHitsSoft17, setDealerHitsSoft17] = useState(false);
  const [doubleRestriction, setDoubleRestriction] = useState<"9-11" | "any">("9-11");
  const [minBet, setMinBet] = useState(50);
  const [maxBet, setMaxBet] = useState(1000);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (user) {
      setName(user.username);
      setSelectedAvatar(user.avatarId);
      setProfile(user.username, user.avatarId);
    }
  }, [user, setProfile]);

  const handleProfileChange = (newName: string, newAvatar: string) => {
    setName(newName);
    setSelectedAvatar(newAvatar);
    setProfile(newName, newAvatar);
  };

  const handleCreate = async () => {
    const finalName = name.trim() || "Player";
    handleProfileChange(finalName, selectedAvatar);
    clearError();
    setIsSubmitting(true);
    try {
      const code = await createRoom(
        undefined,
        {
          decks,
          blackjackPayout,
          dealerHitsSoft17,
          doubleRestriction,
          minBet,
          maxBet,
        },
        buyIn,
      );
      navigate(`/r/${code}`);
    } catch {
      // Error handled by store
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalCode = joinCode.trim().toUpperCase();
    if (!finalCode) return;
    const finalName = name.trim() || "Player";
    handleProfileChange(finalName, selectedAvatar);
    clearError();
    setIsSubmitting(true);
    try {
      await joinRoom(finalCode, undefined, buyIn);
      navigate(`/r/${finalCode}`);
    } catch {
      // Error handled by store
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07130a] text-emerald-100 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background felt texture & subtle gradient rings */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#11381d] via-[#091f11] to-[#040c06] -z-10" />

      {/* Top Bar for Auth State - Hidden per user request for now */}

      <div className="w-full max-w-md bg-[#0a1a0f]/90 border border-emerald-800/60 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center justify-center gap-2 mb-1">
            <span className="text-3xl text-gold-400">♠</span>
            <h1 className="text-3xl sm:text-4xl font-black tracking-widest text-white">FELT</h1>
            <span className="text-3xl text-gold-400">♣</span>
          </div>
          <p className="text-xs sm:text-sm text-emerald-400 font-medium">
            Real-time multiplayer blackjack for friends
          </p>
        </div>

        {/* Global Error Banner if any */}
        {errorMessage && (
          <div className="bg-rose-950/80 border border-rose-700/60 rounded-xl p-3 text-xs text-rose-200 flex items-center justify-between animate-fade-in">
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={clearError}
              className="text-rose-400 hover:text-white font-bold ml-2 text-sm"
            >
              ✕
            </button>
          </div>
        )}

        {/* Profile Card: Name & Avatar */}
        <div className="space-y-3 bg-emerald-950/40 border border-emerald-900/60 rounded-2xl p-4">
          <label
            htmlFor="display-name-input"
            className="block text-xs font-bold uppercase tracking-wider text-emerald-300"
          >
            Player Name
          </label>
          <input
            id="display-name-input"
            type="text"
            value={name}
            onChange={(e) => handleProfileChange(e.target.value, selectedAvatar)}
            placeholder="Enter your name..."
            maxLength={20}
            className="w-full bg-black/50 border border-emerald-700/60 focus:border-gold-400 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-white placeholder-emerald-600 focus:outline-none transition-colors"
          />

          <span className="block text-xs font-bold uppercase tracking-wider text-emerald-300 pt-1">
            Choose Avatar
          </span>
          <div className="grid grid-cols-6 gap-2">
            {AVATAR_OPTIONS.map((avatar) => {
              const isSelected = selectedAvatar === avatar.id;
              return (
                <button
                  type="button"
                  key={avatar.id}
                  onClick={() => handleProfileChange(name, avatar.id)}
                  className={`h-11 rounded-xl flex items-center justify-center text-xl transition-all ${
                    isSelected
                      ? "bg-gold-400/20 border-2 border-gold-400 scale-105 shadow-md"
                      : "bg-emerald-950/80 border border-emerald-800/40 hover:bg-emerald-900/40"
                  }`}
                  title={avatar.name}
                >
                  {avatar.emoji}
                </button>
              );
            })}
          </div>

          {/* Buy-In Chips */}
          <div className="pt-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                Chips To Enter With
              </span>
              <span className="text-xs font-mono font-bold text-gold-400">
                ₹{buyIn.toLocaleString()}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 mb-2">
              {[500, 1000, 2500, 5000].map((preset) => (
                <button
                  type="button"
                  key={preset}
                  onClick={() => setBuyIn(preset)}
                  className={`py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                    buyIn === preset
                      ? "bg-gold-400 text-black shadow-sm"
                      : "bg-emerald-950/80 border border-emerald-800/40 text-emerald-200 hover:bg-emerald-900/40"
                  }`}
                >
                  ₹{preset.toLocaleString()}
                </button>
              ))}
            </div>
            <input
              type="number"
              min={100}
              max={100000}
              step={100}
              value={buyIn}
              onChange={(e) => setBuyIn(Math.max(100, Number.parseInt(e.target.value, 10) || 100))}
              className="w-full bg-black/50 border border-emerald-700/60 focus:border-gold-400 rounded-xl px-3.5 py-2 text-sm font-mono font-semibold text-white placeholder-emerald-600 focus:outline-none transition-colors"
              placeholder="Custom chip amount"
            />
          </div>
        </div>

        {/* Action Buttons: Host vs Join */}
        <div className="space-y-4 pt-2">
          {/* Create Table */}
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleCreate}
            className="w-full min-h-[48px] py-3 rounded-2xl bg-gold-400 hover:bg-gold-300 active:scale-[0.98] text-black font-extrabold text-sm tracking-wide shadow-lg transition-all flex items-center justify-center gap-2"
          >
            <span>Create New Table</span>
            <span className="text-base">→</span>
          </button>

          {/* Table Customization Toggle */}
          <div className="pt-0.5">
            <button
              type="button"
              onClick={() => setShowTableRules(!showTableRules)}
              className="w-full py-2 px-3 rounded-xl bg-black/40 hover:bg-black/60 border border-emerald-800/50 text-xs font-semibold text-gold-300/90 flex items-center justify-between transition-all"
            >
              <span className="flex items-center gap-1.5">
                <span>⚙</span>
                <span>
                  Customize Table Rules ({decks} Decks • {dealerHitsSoft17 ? "H17" : "S17"} • ₹
                  {minBet}-₹{maxBet})
                </span>
              </span>
              <span>{showTableRules ? "▲" : "▼"}</span>
            </button>

            {showTableRules && (
              <div className="mt-2.5 p-3.5 bg-black/60 border border-emerald-800/60 rounded-2xl space-y-3 animate-fade-in text-xs">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10px] text-emerald-400 block font-bold uppercase mb-1">
                      Decks
                    </label>
                    <select
                      aria-label="Decks"
                      value={decks}
                      onChange={(e) =>
                        setDecks(Number.parseInt(e.target.value, 10) as 1 | 2 | 4 | 6 | 8)
                      }
                      className="w-full bg-[#0a1a0f] border border-emerald-700/70 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs"
                    >
                      {[1, 2, 4, 6, 8].map((d) => (
                        <option key={d} value={d}>
                          {d} {d === 1 ? "Deck" : "Decks"}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-emerald-400 block font-bold uppercase mb-1">
                      Blackjack Payout
                    </label>
                    <select
                      aria-label="Blackjack Payout"
                      value={blackjackPayout}
                      onChange={(e) => setBlackjackPayout(e.target.value as "3:2" | "6:5")}
                      className="w-full bg-[#0a1a0f] border border-emerald-700/70 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs"
                    >
                      <option value="3:2">3:2 (Standard)</option>
                      <option value="6:5">6:5</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-emerald-400 block font-bold uppercase mb-1">
                      Dealer Rule
                    </label>
                    <select
                      aria-label="Dealer Rule"
                      value={dealerHitsSoft17 ? "H17" : "S17"}
                      onChange={(e) => setDealerHitsSoft17(e.target.value === "H17")}
                      className="w-full bg-[#0a1a0f] border border-emerald-700/70 rounded-lg px-2 py-1.5 text-white text-xs"
                    >
                      <option value="S17">Stands on 17 (S17)</option>
                      <option value="H17">Hits Soft 17 (H17)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-emerald-400 block font-bold uppercase mb-1">
                      Double Down
                    </label>
                    <select
                      aria-label="Double Down"
                      value={doubleRestriction}
                      onChange={(e) => setDoubleRestriction(e.target.value as "9-11" | "any")}
                      className="w-full bg-[#0a1a0f] border border-emerald-700/70 rounded-lg px-2 py-1.5 text-white text-xs"
                    >
                      <option value="9-11">Hard 9, 10, 11 only</option>
                      <option value="any">Any initial 2 cards</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-emerald-400 block font-bold uppercase mb-1">
                      Min Bet (₹)
                    </label>
                    <input
                      type="number"
                      value={minBet}
                      min={10}
                      max={maxBet}
                      onChange={(e) => setMinBet(Number.parseInt(e.target.value, 10) || 50)}
                      className="w-full bg-[#0a1a0f] border border-emerald-700/70 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-emerald-400 block font-bold uppercase mb-1">
                      Max Bet (₹)
                    </label>
                    <input
                      type="number"
                      value={maxBet}
                      min={minBet}
                      onChange={(e) => setMaxBet(Number.parseInt(e.target.value, 10) || 1000)}
                      className="w-full bg-[#0a1a0f] border border-emerald-700/70 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="relative flex items-center justify-center">
            <div className="border-t border-emerald-900/60 w-full" />
            <span className="bg-[#0a1a0f] px-3 text-[11px] font-bold text-emerald-500 uppercase tracking-wider">
              or join existing
            </span>
          </div>

          {/* Join with Code */}
          <form onSubmit={handleJoin} className="flex gap-2">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ROOM CODE"
              maxLength={6}
              className="flex-1 min-h-[44px] bg-black/50 border border-emerald-700/60 focus:border-gold-400 rounded-xl px-3 py-2 text-center text-sm font-mono font-bold tracking-widest text-gold-300 placeholder-emerald-700 uppercase focus:outline-none transition-colors"
            />
            <button
              type="submit"
              disabled={isSubmitting || !joinCode.trim()}
              className="min-h-[44px] px-5 rounded-xl bg-emerald-700 hover:bg-emerald-600 active:scale-95 disabled:opacity-40 text-white font-bold text-sm tracking-wide shadow transition-all"
            >
              Join
            </button>
          </form>
        </div>
      </div>

      <footer className="mt-6 text-center text-xs text-emerald-600/80">
        P2P Private Room • No Real Money • Tap & Play
      </footer>

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
      <HistoryModal isOpen={showHistoryModal} onClose={() => setShowHistoryModal(false)} />
    </div>
  );
};
