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
  const [selectedGameType, setSelectedGameType] = useState<"blackjack" | "poker">("blackjack");
  const [showTableRules, setShowTableRules] = useState(false);
  const [decks, setDecks] = useState<1 | 2 | 4 | 6 | 8>(6);
  const [blackjackPayout, setBlackjackPayout] = useState<"3:2" | "6:5">("3:2");
  const [dealerHitsSoft17, setDealerHitsSoft17] = useState(false);
  const [doubleRestriction, setDoubleRestriction] = useState<"9-11" | "any">("9-11");
  const [minBet, setMinBet] = useState(50);
  const [maxBet, setMaxBet] = useState(1000);

  // Poker configuration state
  const [smallBlind, setSmallBlind] = useState(50);
  const [bigBlind, setBigBlind] = useState(100);
  const [actionTimer, setActionTimer] = useState(30);
  const [maxSeats, setMaxSeats] = useState<6 | 9>(9);

  const [landingMode, setLandingMode] = useState<"join" | "create">("join");

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (initialCode) {
      setLandingMode("join");
      setJoinCode(initialCode.toUpperCase());
    }
  }, [initialCode]);

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
      const config =
        selectedGameType === "poker"
          ? {
              smallBlind,
              bigBlind,
              actionTimer,
              maxSeats,
              startingStack: buyIn,
            }
          : {
              decks,
              blackjackPayout,
              dealerHitsSoft17,
              doubleRestriction,
              minBet,
              maxBet,
            };
      const code = await createRoom(undefined, config, buyIn, selectedGameType);
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
    <div
      className="min-h-[100dvh] w-full bg-[#07130a] text-emerald-100 flex flex-col items-center p-3 sm:p-6 pb-8 relative overflow-y-auto overflow-x-hidden"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      {/* Background felt texture & subtle gradient rings */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#11381d] via-[#091f11] to-[#040c06] -z-10" />

      {/* Top Bar for Auth State - Hidden per user request for now */}

      <div className="w-full max-w-md bg-[#0a1a0f]/95 border border-emerald-800/60 rounded-3xl p-4 sm:p-7 shadow-2xl backdrop-blur-md space-y-4 sm:space-y-5 py-6 my-auto">
        {/* Brand Header */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center justify-center gap-2 mb-1">
            <span className="text-3xl text-gold-400">♠</span>
            <h1 className="text-3xl sm:text-4xl font-black tracking-widest text-white">FELT</h1>
            <span className="text-3xl text-gold-400">🃏</span>
          </div>
          <p className="text-xs sm:text-sm text-emerald-300 font-bold tracking-wide">
            Real-Time Multiplayer Poker & Blackjack
          </p>
          <p className="text-[11px] text-emerald-500/80 font-mono">
            Private Casino Card Room for Friends
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

        {/* Game Mode Tab: Texas Hold'em vs Blackjack */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-black uppercase tracking-wider text-gold-400 flex items-center gap-1.5">
              <span>🎮</span>
              <span>Select Game</span>
            </span>
            <span className="text-[10px] text-emerald-400 font-mono">
              {selectedGameType === "poker" ? "Texas Hold'em (No Limit)" : "Casino Blackjack"}
            </span>
          </div>

          <div className="grid grid-cols-2 p-1 bg-black/70 border border-emerald-700/80 rounded-2xl shadow-xl gap-1">
            <button
              type="button"
              onClick={() => {
                setSelectedGameType("poker");
                if (buyIn === 1000) setBuyIn(2500);
              }}
              className={`py-3 px-3 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 ${
                selectedGameType === "poker"
                  ? "bg-gradient-to-r from-gold-400 to-amber-400 text-black shadow-lg scale-[1.02] border border-gold-300 ring-2 ring-gold-400/40"
                  : "text-emerald-300/80 hover:text-white hover:bg-emerald-900/30"
              }`}
            >
              <span className="text-lg">🃏</span>
              <span>Texas Hold'em</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedGameType("blackjack");
                if (buyIn === 2500) setBuyIn(1000);
              }}
              className={`py-3 px-3 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 ${
                selectedGameType === "blackjack"
                  ? "bg-gradient-to-r from-gold-400 to-amber-400 text-black shadow-lg scale-[1.02] border border-gold-300 ring-2 ring-gold-400/40"
                  : "text-emerald-300/80 hover:text-white hover:bg-emerald-900/30"
              }`}
            >
              <span className="text-lg">♠</span>
              <span>Blackjack</span>
            </button>
          </div>
        </div>

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

          {/* Buy-In / Initial Coins */}
          <div className="pt-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                {selectedGameType === "poker"
                  ? landingMode === "create"
                    ? "Initial Coins for Each Player"
                    : "Initial Table Coins"
                  : "Chips To Enter With (Max ₹20k)"}
              </span>
              <span className="text-xs font-mono font-bold text-gold-400">
                ₹{buyIn.toLocaleString()}
              </span>
            </div>
            {selectedGameType === "poker" && landingMode === "join" ? (
              <div className="p-2.5 rounded-xl bg-black/40 border border-emerald-800/40 text-[11px] text-emerald-300/90 leading-relaxed">
                ℹ️ The host configures initial coins for this poker room. All players join with equal starting coins.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-1.5 mb-2">
                  {(selectedGameType === "poker"
                    ? [2500, 5000, 10000, 20000]
                    : [1000, 5000, 10000, 20000]
                  ).map((preset) => (
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
                  max={20000}
                  step={100}
                  value={buyIn}
                  onChange={(e) =>
                    setBuyIn(Math.min(20000, Math.max(100, Number.parseInt(e.target.value, 10) || 100)))
                  }
                  className="w-full bg-black/50 border border-emerald-700/60 focus:border-gold-400 rounded-xl px-3.5 py-2 text-sm font-mono font-semibold text-white placeholder-emerald-600 focus:outline-none transition-colors"
                  placeholder={
                    selectedGameType === "poker"
                      ? "Initial coins for each player (max 20,000)"
                      : "Custom chip amount (max 20,000)"
                  }
                />
                {selectedGameType === "poker" && landingMode === "create" && (
                  <p className="text-[10px] text-emerald-400/80 mt-1">
                    Every player joining your room starts with this exact initial balance.
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Mode Selector Tabs: Join Table vs Create Table */}
        <div className="grid grid-cols-2 p-1 bg-black/60 border border-emerald-800/80 rounded-2xl shadow-inner">
          <button
            type="button"
            onClick={() => setLandingMode("join")}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              landingMode === "join"
                ? "bg-gold-400 text-black shadow-md font-extrabold"
                : "text-emerald-300 hover:text-white"
            }`}
          >
            <span>🔑</span>
            <span>Join {selectedGameType === "poker" ? "Poker" : "Blackjack"}</span>
          </button>
          <button
            type="button"
            onClick={() => setLandingMode("create")}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              landingMode === "create"
                ? "bg-gold-400 text-black shadow-md font-extrabold"
                : "text-emerald-300 hover:text-white"
            }`}
          >
            <span>{selectedGameType === "poker" ? "🃏" : "♠"}</span>
            <span>Create Table</span>
          </button>
        </div>

        {/* Action Content Based on Mode */}
        {landingMode === "join" ? (
          /* 1. Join Table Option with Prominent Room Code */
          <form onSubmit={handleJoin} className="space-y-3.5 pt-1">
            <div className="space-y-1.5">
              <label
                htmlFor="room-code-input"
                className="block text-xs font-bold uppercase tracking-wider text-emerald-300"
              >
                Enter {selectedGameType === "poker" ? "Poker" : "Blackjack"} Room Code
              </label>
              <div className="flex gap-2">
                <input
                  id="room-code-input"
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="ROOM CODE"
                  maxLength={6}
                  autoFocus={Boolean(initialCode)}
                  className="flex-1 min-h-[48px] bg-black/60 border-2 border-emerald-700/80 focus:border-gold-400 rounded-xl px-3 py-2 text-center text-base sm:text-lg font-mono font-bold tracking-widest text-gold-300 placeholder-emerald-700 uppercase focus:outline-none transition-colors"
                />
                <button
                  type="submit"
                  disabled={isSubmitting || !joinCode.trim()}
                  className="min-h-[48px] px-5 sm:px-6 rounded-xl bg-gold-400 hover:bg-gold-300 active:scale-95 disabled:opacity-40 text-black font-extrabold text-sm tracking-wide shadow-lg transition-all flex items-center justify-center gap-1"
                >
                  <span>Join</span>
                  <span>→</span>
                </button>
              </div>
              <p className="text-[11px] text-emerald-400/80">
                Ask the host for the 6-letter room code or join via private invite link.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setLandingMode("create")}
              className="w-full text-center text-xs text-gold-400/80 hover:text-gold-300 underline font-medium pt-1"
            >
              Hosting a table instead? Create New Table →
            </button>
          </form>
        ) : (
          /* 2. Create New Table Option */
          <div className="space-y-3.5 pt-1">
            {/* Quick Stakes Presets for Poker */}
            {selectedGameType === "poker" && (
              <div className="space-y-1.5 bg-black/40 border border-emerald-800/40 p-2.5 rounded-xl">
                <span className="text-[10px] text-emerald-300 block font-bold uppercase tracking-wider">
                  Quick Blind Presets
                </span>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { name: "Micro", sb: 10, bb: 20 },
                    { name: "Standard", sb: 25, bb: 50 },
                    { name: "Deep", sb: 50, bb: 100 },
                    { name: "High", sb: 100, bb: 200 },
                  ].map((preset) => (
                    <button
                      type="button"
                      key={preset.name}
                      onClick={() => {
                        setSmallBlind(preset.sb);
                        setBigBlind(preset.bb);
                      }}
                      className={`py-1.5 rounded-lg text-[10px] font-mono font-bold transition-all ${
                        smallBlind === preset.sb && bigBlind === preset.bb
                          ? "bg-gold-400 text-black shadow-sm"
                          : "bg-emerald-950/80 border border-emerald-800/40 text-emerald-300 hover:bg-emerald-900/40"
                      }`}
                    >
                      ₹{preset.sb}/₹{preset.bb}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleCreate}
              className="w-full min-h-[48px] py-3 rounded-2xl bg-gradient-to-r from-gold-400 to-amber-400 hover:from-gold-300 hover:to-amber-300 active:scale-[0.98] text-black font-extrabold text-sm tracking-wide shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <span>
                Create {selectedGameType === "poker" ? `Texas Hold'em (₹${smallBlind}/₹${bigBlind})` : "Blackjack"} Table
              </span>
              <span className="text-base">→</span>
            </button>

            {/* Table Customization Toggle */}
            <div>
              <button
                type="button"
                onClick={() => setShowTableRules(!showTableRules)}
                className="w-full py-2 px-3 rounded-xl bg-black/40 hover:bg-black/60 border border-emerald-800/50 text-xs font-semibold text-gold-300/90 flex items-center justify-between transition-all"
              >
                <span className="flex items-center gap-1.5">
                  <span>⚙</span>
                  <span>
                    {selectedGameType === "poker"
                      ? `Customize Rules (Blinds ₹${smallBlind}/₹${bigBlind} • ${actionTimer}s • ${maxSeats} Seats)`
                      : `Customize Rules (${decks} Decks • ${dealerHitsSoft17 ? "H17" : "S17"} • ₹${minBet}-₹${maxBet})`}
                  </span>
                </span>
                <span>{showTableRules ? "▲" : "▼"}</span>
              </button>

              {showTableRules && (
                <div className="mt-2.5 p-3.5 bg-black/60 border border-emerald-800/60 rounded-2xl space-y-3 animate-fade-in text-xs">
                  {selectedGameType === "poker" ? (
                    /* Poker Rules Form */
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[10px] text-emerald-400 block font-bold uppercase mb-1">
                          Small Blind (₹)
                        </label>
                        <input
                          type="number"
                          value={smallBlind}
                          min={5}
                          max={bigBlind}
                          onChange={(e) => setSmallBlind(Number.parseInt(e.target.value, 10) || 25)}
                          className="w-full bg-[#0a1a0f] border border-emerald-700/70 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-emerald-400 block font-bold uppercase mb-1">
                          Big Blind (₹)
                        </label>
                        <input
                          type="number"
                          value={bigBlind}
                          min={smallBlind}
                          max={5000}
                          onChange={(e) => setBigBlind(Number.parseInt(e.target.value, 10) || 50)}
                          className="w-full bg-[#0a1a0f] border border-emerald-700/70 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-emerald-400 block font-bold uppercase mb-1">
                          Action Timer
                        </label>
                        <select
                          aria-label="Action Timer"
                          value={actionTimer}
                          onChange={(e) => setActionTimer(Number.parseInt(e.target.value, 10))}
                          className="w-full bg-[#0a1a0f] border border-emerald-700/70 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs"
                        >
                          <option value={15}>15 Seconds</option>
                          <option value={30}>30 Seconds</option>
                          <option value={45}>45 Seconds</option>
                          <option value={60}>60 Seconds</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] text-emerald-400 block font-bold uppercase mb-1">
                          Table Capacity
                        </label>
                        <select
                          aria-label="Table Capacity"
                          value={maxSeats}
                          onChange={(e) => setMaxSeats(Number.parseInt(e.target.value, 10) as 6 | 9)}
                          className="w-full bg-[#0a1a0f] border border-emerald-700/70 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs"
                        >
                          <option value={6}>6-Max</option>
                          <option value={9}>9-Max (Full Ring)</option>
                        </select>
                      </div>

                      <div className="col-span-2">
                        <label className="text-[10px] text-emerald-400 block font-bold uppercase mb-1">
                          Initial Coins for Each Player (₹)
                        </label>
                        <input
                          type="number"
                          value={buyIn}
                          min={100}
                          max={20000}
                          step={100}
                          onChange={(e) =>
                            setBuyIn(Math.min(20000, Math.max(100, Number.parseInt(e.target.value, 10) || 100)))
                          }
                          className="w-full bg-[#0a1a0f] border border-emerald-700/70 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs"
                        />
                        <span className="text-[10px] text-emerald-500/80 mt-0.5 block">
                          All players joining will start with this exact balance.
                        </span>
                      </div>
                    </div>
                  ) : (
                    /* Blackjack Rules Form */
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
                          Max Bet (Max ₹5,000)
                        </label>
                        <input
                          type="number"
                          value={maxBet}
                          min={minBet}
                          max={5000}
                          onChange={(e) =>
                            setMaxBet(
                              Math.min(
                                5000,
                                Math.max(minBet, Number.parseInt(e.target.value, 10) || 1000),
                              ),
                            )
                          }
                          className="w-full bg-[#0a1a0f] border border-emerald-700/70 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setLandingMode("join")}
              className="w-full text-center text-xs text-gold-400/80 hover:text-gold-300 underline font-medium pt-1"
            >
              Have a room code from a friend? Join with Code →
            </button>
          </div>
        )}
      </div>

      <footer className="mt-4 mb-2 text-center text-xs text-emerald-600/80">
        P2P Private Room • No Real Money • Tap & Play
      </footer>

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
      <HistoryModal isOpen={showHistoryModal} onClose={() => setShowHistoryModal(false)} />
    </div>
  );
};
